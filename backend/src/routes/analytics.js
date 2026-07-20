const express = require('express');
const { query, get } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET: Core dashboard statistics and visualization data
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Balance Summary Card Info
    const balanceRow = await get('SELECT SUM(balance) as total FROM accounts WHERE user_id = ?', [userId]);
    const totalBalance = balanceRow.total || 0.0;

    const accountCountRow = await get('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?', [userId]);
    const totalAccounts = accountCountRow.cnt || 0;

    const alertsRow = await get(
      `SELECT COUNT(*) as cnt FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Flagged as Fraud'`,
      [userId]
    );
    const fraudAlerts = alertsRow.cnt || 0;

    const avgRiskRow = await get(
      `SELECT AVG(t.risk_score) as avg_score FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ?`,
      [userId]
    );
    const overallRiskScore = avgRiskRow.avg_score !== null ? Math.round(avgRiskRow.avg_score * 10) / 10 : 12.5; // default low risk if empty

    // 2. Spending Breakdown by Category
    const spendingRows = await query(
      `SELECT t.category, SUM(t.amount) as value
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.type = 'debit'
       GROUP BY t.category`,
      [userId]
    );

    // 3. Balance Trend over Time (Recharts)
    // Gather chronological list of transactions to reconstruct balance timeline
    const txns = await query(
      `SELECT t.date, t.amount, t.type, t.account_id
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ?
       ORDER BY t.date ASC`,
      [userId]
    );

    const initialBalances = await query('SELECT id, balance FROM accounts WHERE user_id = ?', [userId]);
    const balanceMap = {};
    let runningSum = 0;
    initialBalances.forEach(acc => {
      balanceMap[acc.id] = acc.balance;
      runningSum += acc.balance;
    });

    // Walk backwards or forwards. Let's do a simple calculation of balance changes.
    // If we have accounts with current balances and we walk backwards, we can compute historical balances.
    // But since this is a demo, let's create a forward timeline.
    // Start with a base balance (e.g. 50% of current balance) and apply each transaction.
    let currentBalanceAccumulator = runningSum * 0.7; // starting offset for graph visuals
    
    // Group transactions by date to prevent graph clutter
    const dailyTxns = {};
    txns.forEach(t => {
      const day = t.date.split(' ')[0];
      if (!dailyTxns[day]) dailyTxns[day] = 0;
      // credits add to balance, debits subtract
      if (t.type === 'credit') {
        dailyTxns[day] += t.amount;
      } else {
        dailyTxns[day] -= t.amount;
      }
    });

    const balanceHistory = [];
    const sortedDays = Object.keys(dailyTxns).sort();
    
    // Seed an initial balance point if empty
    if (sortedDays.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      balanceHistory.push({ date: today, balance: runningSum });
    } else {
      // If we have days, build step timeline
      let tempBal = runningSum;
      // We calculate backwards first, to fit current balance on the final date
      const reversedDays = [...sortedDays].reverse();
      const reversedHistory = [];
      
      reversedHistory.push({ date: new Date().toISOString().split('T')[0], balance: Math.round(tempBal * 100) / 100 });
      
      for (const day of reversedDays) {
        tempBal = tempBal - dailyTxns[day]; // reverse the transaction effect
        reversedHistory.push({ date: day, balance: Math.round(tempBal * 100) / 100 });
      }
      balanceHistory.push(...reversedHistory.reverse());
    }

    // 4. Recent Transactions (Last 10)
    const recentTransactions = await query(
      `SELECT t.id, t.date, t.description, t.amount, t.type, t.category, t.status, t.risk_score
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ?
       ORDER BY t.date DESC, t.id DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      summary: {
        totalBalance,
        totalAccounts,
        fraudAlerts,
        overallRiskScore
      },
      spendingBreakdown: spendingRows,
      balanceHistory,
      recentTransactions
    });
  } catch (err) {
    console.error('Fetch dashboard metrics error:', err);
    res.status(500).json({ error: 'Failed to aggregate dashboard analytics.' });
  }
});

// GET: Deep fraud trends and counts
router.get('/fraud-trends', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Total Fraud Stats
    const fraudSumRow = await get(
      `SELECT COUNT(*) as count, SUM(t.amount) as total_amount FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Flagged as Fraud'`,
      [userId]
    );
    const totalFraudCount = fraudSumRow.count || 0;
    const totalFraudAmount = fraudSumRow.total_amount || 0.0;

    // 2. Most common fraud categories
    const commonCategories = await query(
      `SELECT t.category, COUNT(*) as count, SUM(t.amount) as total_amount FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Flagged as Fraud'
       GROUP BY t.category
       ORDER BY count DESC`,
      [userId]
    );

    // 3. Fraud alerts over time (weekly/monthly aggregation)
    const trendRows = await query(
      `SELECT strftime('%Y-%m', t.date) as month, COUNT(*) as count, SUM(t.amount) as total_amount
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Flagged as Fraud'
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );

    res.json({
      totalFraudCount,
      totalFraudAmount,
      commonCategories,
      trendRows
    });
  } catch (err) {
    console.error('Fetch fraud trends error:', err);
    res.status(500).json({ error: 'Failed to fetch fraud center analytics.' });
  }
});

// GET: Retrieve ML Model training status and scores
router.get('/model-info', verifyToken, async (req, res) => {
  try {
    const mlRes = await fetch(`${ML_ENGINE_URL}/metrics`);
    if (mlRes.ok) {
      const metrics = await mlRes.json();
      return res.json(metrics);
    }
    // If FastAPI is not running or returns error, provide a placeholder metric for presentation
    return res.json({
      accuracy: 0.952,
      precision: 0.928,
      recall: 0.905,
      f1_score: 0.916,
      last_trained_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
      total_samples: 1000,
      fraud_ratio: 0.05,
      is_placeholder: true
    });
  } catch (err) {
    // Return a mocked object for presentation purposes instead of erroring out when ML service is booting
    return res.json({
      accuracy: 0.952,
      precision: 0.928,
      recall: 0.905,
      f1_score: 0.916,
      last_trained_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
      total_samples: 1000,
      fraud_ratio: 0.05,
      is_placeholder: true
    });
  }
});

module.exports = router;
