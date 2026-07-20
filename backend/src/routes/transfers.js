const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { run, get, query } = require('../db');
const { verifyToken } = require('../middleware/auth');
const { sendMail } = require('../services/mailer');

const router = express.Router();
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000';

// Helper to query ML Engine for a real-time risk prediction
const getTransactionRisk = async (txnData) => {
  try {
    const response = await fetch(`${ML_ENGINE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([txnData])
    });
    if (!response.ok) {
      const errMsg = await response.text();
      console.error('ML Engine risk check failed:', errMsg);
      return null;
    }
    const scores = await response.json();
    return scores[0]; // Returns { risk_score, risk_level, reasons, is_anomaly }
  } catch (err) {
    console.error('Failed to communicate with ML Engine:', err.message);
    return null;
  }
};

// GET: Retrieve transfer history for user
router.get('/', verifyToken, async (req, res) => {
  try {
    const transfers = await query(
      `SELECT t.id, t.from_account_id, a.bank_name as from_bank, a.account_number as from_account,
              t.to_account_name, t.to_account_number, t.to_routing_number, t.amount, t.note,
              t.risk_level, t.status, t.created_at
       FROM transfers t
       JOIN accounts a ON t.from_account_id = a.id
       WHERE t.user_id = ? ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(transfers);
  } catch (err) {
    console.error('Fetch transfers error:', err);
    res.status(500).json({ error: 'Failed to retrieve transfer history.' });
  }
});

// POST: Pre-scoring Risk Check (Returns score and reasoning without committing transfer)
router.post('/check-risk', verifyToken, async (req, res) => {
  const { fromAccountId, toAccountName, toAccountNumber, toRoutingNumber, amount } = req.body;

  if (!fromAccountId || !toAccountName || !toAccountNumber || !toRoutingNumber || !amount) {
    return res.status(400).json({ error: 'All fields (fromAccountId, toAccountName, toAccountNumber, toRoutingNumber, amount) are required for checking risk.' });
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Transfer amount must be a positive number.' });
  }

  try {
    const account = await get('SELECT balance, bank_name, account_number FROM accounts WHERE id = ? AND user_id = ?', [fromAccountId, req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'Sending bank account not found.' });
    }

    if (account.balance < amt) {
      return res.status(400).json({ error: 'Insufficient funds for this transfer.' });
    }

    // Format transaction payload for the ML microservice
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const txnPayload = {
      date: now,
      description: `Transfer to ${toAccountName} A/C ${toAccountNumber} (IFSC: ${toRoutingNumber})`,
      amount: amt,
      type: 'debit',
      balance: account.balance - amt,
      category: 'Transfer'
    };

    const riskPrediction = await getTransactionRisk(txnPayload);

    if (!riskPrediction) {
      // Fallback local scoring if ML microservice is down
      const fallbackScore = amt > 10000 ? 55.0 : 15.0;
      const fallbackLevel = fallbackScore > 50 ? 'Medium' : 'Low';
      const fallbackReasons = amt > 10000 ? ['Large transaction amount above safety limits'] : ['Safe transaction'];
      return res.json({
        risk_score: fallbackScore,
        risk_level: fallbackLevel,
        reasons: fallbackReasons,
        is_anomaly: amt > 10000 ? 1 : 0,
        is_fallback: true
      });
    }

    res.json(riskPrediction);
  } catch (err) {
    console.error('Check risk error:', err);
    res.status(500).json({ error: 'Failed to process risk analysis.' });
  }
});

// POST: Execute money transfer
router.post('/', verifyToken, async (req, res) => {
  const { fromAccountId, toAccountName, toAccountNumber, toRoutingNumber, amount, note, overrideConfirmed } = req.body;

  if (!fromAccountId || !toAccountName || !toAccountNumber || !toRoutingNumber || !amount) {
    return res.status(400).json({ error: 'Missing required transfer details.' });
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Transfer amount must be a positive number.' });
  }

  try {
    const account = await get('SELECT balance, bank_name, account_number FROM accounts WHERE id = ? AND user_id = ?', [fromAccountId, req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'Originating account not found.' });
    }

    if (account.balance < amt) {
      return res.status(400).json({ error: 'Insufficient account balance.' });
    }

    // Call ML check again to prevent bypass
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const desc = `Transfer to ${toAccountName} A/C ${toAccountNumber} (IFSC: ${toRoutingNumber})`;
    const txnPayload = {
      date: now,
      description: desc,
      amount: amt,
      type: 'debit',
      balance: account.balance - amt,
      category: 'Transfer'
    };

    let risk = await getTransactionRisk(txnPayload);
    if (!risk) {
      risk = {
        risk_score: amt > 10000 ? 55.0 : 15.0,
        risk_level: amt > 10000 ? 'Medium' : 'Low',
        reasons: amt > 10000 ? ['Large transaction amount above safety limits'] : ['Safe transaction'],
        is_anomaly: amt > 10000 ? 1 : 0
      };
    }

    // If High/Medium risk and user has not confirmed override, prompt them
    if ((risk.risk_level === 'High' || risk.risk_level === 'Medium') && !overrideConfirmed) {
      return res.status(202).json({
        warning: 'Transaction flagged as elevated risk.',
        risk_level: risk.risk_level,
        risk_score: risk.risk_score,
        reasons: risk.reasons,
        requires_override: true
      });
    }

    // Execute transaction updates inside a mock sequential block
    const newBalance = account.balance - amt;
    const transferId = uuidv4();
    const txnId = uuidv4();

    // 1. Update sender balance
    await run('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, fromAccountId]);

    // 2. Insert into transfers log
    await run(
      `INSERT INTO transfers (id, user_id, from_account_id, to_account_name, to_account_number, to_routing_number, amount, note, risk_level, risk_score, risk_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [transferId, req.user.id, fromAccountId, toAccountName, toAccountNumber, toRoutingNumber, amt, note || null, risk.risk_level, risk.risk_score, risk.reasons.join('; '), 'Success']
    );

    // 3. Log into transactions log (with status Safe, Suspicious, Flagged)
    const status = risk.risk_level === 'High' ? 'Flagged as Fraud' : (risk.risk_level === 'Medium' ? 'Pending' : 'Transferred');
    await run(
      `INSERT INTO transactions (id, statement_id, account_id, date, description, amount, type, category, status, risk_score, is_fraud, is_anomaly, fraud_reason)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [txnId, fromAccountId, now.split(' ')[0], desc, amt, 'debit', 'Transfer', status, risk.risk_score, risk.is_anomaly, risk.reasons.join(', ')]
    );

    // If High or Medium risk, trigger an automated security alert email
    if (risk.risk_level === 'High' || risk.risk_level === 'Medium') {
      sendMail(
        req.user.email,
        `[SECURITY WARNING] Elevated Transaction Risk Flagged`,
        `Hello,

This is an automated security alert from FraudShield.

A money transfer from your account has been flagged with ${risk.risk_level} Risk (Score: ${risk.risk_score}%).

Transaction Details:
- Date: ${now}
- Destination: ${toAccountName} (A/C: ${toAccountNumber})
- Amount: $${amt}
- Risk Level: ${risk.risk_level}
- Risk Reasons: ${risk.reasons.join(', ')}
- Status: ${status}

If you did not authorize this action, please access your dashboard security settings immediately to lock your account credentials.

Best regards,
FraudShield Security Team`
      ).catch(err => console.error('Failed to send security alert email:', err));
    }

    res.json({
      message: 'Transfer completed successfully.',
      transferId,
      newBalance,
      risk_level: risk.risk_level,
      risk_score: risk.risk_score
    });
  } catch (err) {
    console.error('Execute transfer error:', err);
    res.status(500).json({ error: 'Transfer transaction processing failed.' });
  }
});

module.exports = router;
