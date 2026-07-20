const express = require('express');
const { run, get, query } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000';

// GET: Fetch all flagged/suspicious transactions for user
router.get('/', verifyToken, async (req, res) => {
  const { accountId, riskLevel, search } = req.query;

  let sql = `
    SELECT t.id, t.statement_id, t.account_id, a.bank_name, a.account_number,
           t.date, t.description, t.amount, t.type, t.category, t.status, 
           t.risk_score, t.is_fraud, t.is_anomaly, t.fraud_reason
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  // We filter transactions where status is 'Flagged as Fraud' or 'Pending' or risk_score > 35
  sql += ` AND (t.status = 'Flagged as Fraud' OR t.status = 'Pending' OR t.risk_score >= 35.0)`;

  if (accountId) {
    sql += ` AND t.account_id = ?`;
    params.push(accountId);
  }

  if (riskLevel) {
    if (riskLevel === 'High') {
      sql += ` AND t.risk_score >= 70.0`;
    } else if (riskLevel === 'Medium') {
      sql += ` AND t.risk_score >= 35.0 AND t.risk_score < 70.0`;
    }
  }

  if (search) {
    sql += ` AND t.description LIKE ?`;
    params.push(`%${search}%`);
  }

  sql += ` ORDER BY t.date DESC, t.risk_score DESC`;

  try {
    const transactions = await query(sql, params);
    res.json(transactions);
  } catch (err) {
    console.error('Fetch flagged transactions error:', err);
    res.status(500).json({ error: 'Failed to retrieve flagged transactions.' });
  }
});

// POST: Submit user feedback ("Confirm Fraud" or "False Positive / Mark Safe")
router.post('/:id/feedback', verifyToken, async (req, res) => {
  const txnId = req.params.id;
  const { feedback } = req.body; // 'confirm_fraud' or 'mark_safe'

  if (!feedback || !['confirm_fraud', 'mark_safe'].includes(feedback)) {
    return res.status(400).json({ error: "Feedback must be 'confirm_fraud' or 'mark_safe'." });
  }

  try {
    // Retrieve transaction and check ownership
    const txn = await get(
      `SELECT t.*, a.user_id FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE t.id = ? AND a.user_id = ?`,
      [txnId, req.user.id]
    );

    if (!txn) {
      return res.status(404).json({ error: 'Transaction record not found or access denied.' });
    }

    let newIsFraud = 0;
    let newStatus = '';
    let newRiskScore = txn.risk_score;

    if (feedback === 'confirm_fraud') {
      newIsFraud = 1; // Confirmed Fraud
      newStatus = 'Flagged as Fraud';
    } else {
      newIsFraud = -1; // False Positive / Mark Safe
      newStatus = 'Transferred'; // Reset to standard status
      newRiskScore = 0.0; // Reset score
    }

    // 1. Update SQLite
    await run(
      'UPDATE transactions SET is_fraud = ?, status = ?, risk_score = ? WHERE id = ?',
      [newIsFraud, newStatus, newRiskScore, txnId]
    );

    // If it was a transfer, update corresponding transfer status
    if (!txn.statement_id) {
      await run(
        'UPDATE transfers SET status = ? WHERE user_id = ? AND amount = ? AND created_at LIKE ?',
        [feedback === 'confirm_fraud' ? 'Flagged' : 'Success', req.user.id, txn.amount, `${txn.date}%`]
      );
    }

    // 2. Prepare payload for FastAPI retraining endpoint
    const retrainPayload = {
      date: txn.date,
      description: txn.description,
      amount: txn.amount,
      debit_amount: txn.type === 'debit' ? txn.amount : 0.0,
      credit_amount: txn.type === 'credit' ? txn.amount : 0.0,
      type: txn.type,
      balance: txn.balance,
      category: txn.category,
      is_fraud_label: feedback === 'confirm_fraud' ? 1 : 0
    };

    // Forward to FastAPI retrain loop
    let metrics = null;
    try {
      const mlResponse = await fetch(`${ML_ENGINE_URL}/retrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([retrainPayload])
      });
      if (mlResponse.ok) {
        const retrainResult = await mlResponse.json();
        metrics = retrainResult.metrics;
        console.log('ML engine successfully retrained with user feedback.');
      } else {
        console.error('ML engine retraining API returned error status.');
      }
    } catch (mlErr) {
      console.error('Failed to trigger ML engine retraining:', mlErr.message);
    }

    res.json({
      message: feedback === 'confirm_fraud' ? 'Transaction confirmed as fraudulent.' : 'Transaction marked safe.',
      updated_transaction: {
        id: txnId,
        is_fraud: newIsFraud,
        status: newStatus,
        risk_score: newRiskScore
      },
      model_metrics: metrics
    });
  } catch (err) {
    console.error('Feedback submit error:', err);
    res.status(500).json({ error: 'Failed to process feedback submission.' });
  }
});

module.exports = router;
