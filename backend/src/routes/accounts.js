const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { run, query, get } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Helper to mask account numbers (e.g. "123456789012" -> "********9012")
const maskAccountNumber = (accNum) => {
  const clean = accNum.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
};

// Helper to generate hash for account mapping comparisons
const hashAccountNumber = (accNum) => {
  const clean = accNum.replace(/\s+/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
};

// GET: List all user linked accounts
router.get('/', verifyToken, async (req, res) => {
  try {
    const accounts = await query(
      `SELECT id, bank_name, account_number, account_type, routing_number, balance, is_primary, created_at 
       FROM accounts WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC`,
      [req.user.id]
    );
    res.json(accounts);
  } catch (err) {
    console.error('Fetch accounts error:', err);
    res.status(500).json({ error: 'Failed to retrieve linked bank accounts.' });
  }
});

// POST: Link a new bank account
router.post('/', verifyToken, async (req, res) => {
  const { bankName, accountNumber, accountType, routingNumber, initialBalance } = req.body;

  if (!bankName || !accountNumber || !accountType) {
    return res.status(400).json({ error: 'Bank name, account number, and account type are required.' });
  }

  const accNumStr = String(accountNumber).trim();
  const accHash = hashAccountNumber(accNumStr);
  const accMasked = maskAccountNumber(accNumStr);
  const balance = parseFloat(initialBalance) || 0.0;

  try {
    // Prevent linking the same account twice for this user
    const existing = await get(
      'SELECT id FROM accounts WHERE user_id = ? AND raw_account_number_hash = ?',
      [req.user.id, accHash]
    );
    if (existing) {
      return res.status(400).json({ error: 'This bank account has already been linked to your profile.' });
    }

    // Check if user already has accounts. If this is the first, make it primary.
    const countRow = await get('SELECT COUNT(*) as cnt FROM accounts WHERE user_id = ?', [req.user.id]);
    const isPrimary = countRow.cnt === 0 ? 1 : 0;

    const accountId = uuidv4();

    await run(
      `INSERT INTO accounts (id, user_id, bank_name, account_number, raw_account_number_hash, account_type, routing_number, balance, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [accountId, req.user.id, bankName, accMasked, accHash, accountType, routingNumber || null, balance, isPrimary]
    );

    res.status(201).json({
      message: 'Bank account linked successfully.',
      account: {
        id: accountId,
        bankName,
        accountNumber: accMasked,
        accountType,
        routingNumber,
        balance,
        isPrimary
      }
    });
  } catch (err) {
    console.error('Link account error:', err);
    res.status(500).json({ error: 'Failed to link the bank account.' });
  }
});

// PUT: Set bank account as primary
router.put('/:id/primary', verifyToken, async (req, res) => {
  const accountId = req.params.id;

  try {
    // Verify account ownership
    const account = await get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'Bank account not found or access denied.' });
    }

    // Set all accounts for this user to not primary
    await run('UPDATE accounts SET is_primary = 0 WHERE user_id = ?', [req.user.id]);
    // Set target account to primary
    await run('UPDATE accounts SET is_primary = 1 WHERE id = ?', [accountId]);

    res.json({ message: 'Primary account updated successfully.' });
  } catch (err) {
    console.error('Update primary error:', err);
    res.status(500).json({ error: 'Failed to update primary account setting.' });
  }
});

// DELETE: Unlink/delete bank account
router.delete('/:id', verifyToken, async (req, res) => {
  const accountId = req.params.id;

  try {
    // Verify ownership
    const account = await get('SELECT is_primary FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'Bank account not found or access denied.' });
    }

    // Perform deletion
    await run('DELETE FROM accounts WHERE id = ?', [accountId]);

    // If we deleted the primary account, assign primary status to another account if one exists
    if (account.is_primary === 1) {
      const nextAcc = await get('SELECT id FROM accounts WHERE user_id = ? LIMIT 1', [req.user.id]);
      if (nextAcc) {
        await run('UPDATE accounts SET is_primary = 1 WHERE id = ?', [nextAcc.id]);
      }
    }

    res.json({ message: 'Bank account unlinked successfully.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to unlink the bank account.' });
  }
});

module.exports = router;
