const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { run, query, get } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000';

// Configure multer storage in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper to query SQLite for transactions in an account to detect duplicates
const findDuplicateTransactions = async (accountId, transactions) => {
  if (transactions.length === 0) return 0;
  
  // We check for duplicates using date, description, and amount
  let dupCount = 0;
  for (const txn of transactions) {
    const match = await get(
      `SELECT id FROM transactions 
       WHERE account_id = ? AND date = ? AND description = ? AND amount = ? AND type = ?`,
      [accountId, txn.date, txn.description, txn.amount, txn.type]
    );
    if (match) {
      dupCount++;
    }
  }
  return dupCount;
};

// GET: List all uploaded statements for a user
router.get('/', verifyToken, async (req, res) => {
  try {
    const statements = await query(
      `SELECT s.id, s.account_id, a.bank_name, a.account_number, s.filename, s.upload_date,
              s.start_date, s.end_date, s.status, s.transaction_count, s.fraud_count
       FROM statements s
       JOIN accounts a ON s.account_id = a.id
       WHERE a.user_id = ? ORDER BY s.upload_date DESC`,
      [req.user.id]
    );
    res.json(statements);
  } catch (err) {
    console.error('Fetch statements error:', err);
    res.status(500).json({ error: 'Failed to retrieve statement logs.' });
  }
});

// GET: Retrieve transactions of a specific statement
router.get('/:id/transactions', verifyToken, async (req, res) => {
  const statementId = req.params.id;

  try {
    // Verify ownership
    const statement = await get(
      `SELECT s.id FROM statements s
       JOIN accounts a ON s.account_id = a.id
       WHERE s.id = ? AND a.user_id = ?`,
      [statementId, req.user.id]
    );
    
    if (!statement) {
      return res.status(404).json({ error: 'Statement not found or access denied.' });
    }

    const transactions = await query(
      'SELECT * FROM transactions WHERE statement_id = ? ORDER BY date DESC, id DESC',
      [statementId]
    );
    
    res.json(transactions);
  } catch (err) {
    console.error('Fetch statement transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch statement transactions.' });
  }
});

// POST: Upload, parse, check overlaps, and commit statement
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  const { accountId, bankName, mappingJson, confirmMerge } = req.body;

  if (!accountId || !req.file) {
    return res.status(400).json({ error: 'Account ID and bank statement file are required.' });
  }

  try {
    // 1. Verify account ownership
    const account = await get('SELECT id, bank_name FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
    if (!account) {
      return res.status(404).json({ error: 'Linked account not found.' });
    }

    // 2. Prepare payload for FastAPI ML parser
    const formData = new FormData();
    const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', fileBlob, req.file.originalname);
    formData.append('bank_name', bankName || account.bank_name);
    
    if (mappingJson) {
      formData.append('mapping_json', mappingJson);
    }

    // Call FastAPI
    const mlResponse = await fetch(`${ML_ENGINE_URL}/parse`, {
      method: 'POST',
      body: formData
    });

    if (!mlResponse.ok) {
      const errorMsg = await mlResponse.text();
      return res.status(mlResponse.status).json({ error: `ML Parser Error: ${errorMsg}` });
    }

    const parseResult = await mlResponse.json();

    // 3. If columns are not recognized, bubble up mapping request
    if (parseResult.requires_mapping) {
      return res.json(parseResult);
    }

    const transactions = parseResult.transactions;
    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions could be parsed from the file.' });
    }

    // 4. Calculate date range of uploaded statement
    const dates = transactions.map(t => new Date(t.date).getTime()).filter(t => !isNaN(t));
    const minDateStr = dates.length > 0 ? new Date(Math.min(...dates)).toISOString().split('T')[0] : null;
    const maxDateStr = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().split('T')[0] : null;

    // 5. Check for overlaps and duplicates
    // Is there any existing statement overlapping this date range?
    const overlaps = await query(
      `SELECT id, filename, start_date, end_date FROM statements 
       WHERE account_id = ? AND (
         (start_date <= ? AND end_date >= ?) OR 
         (start_date <= ? AND end_date >= ?) OR
         (start_date >= ? AND end_date <= ?)
       )`,
      [accountId, minDateStr, minDateStr, maxDateStr, maxDateStr, minDateStr, maxDateStr]
    );

    const isOverlap = overlaps.length > 0;
    const duplicateCount = await findDuplicateTransactions(accountId, transactions);

    // If overlap detected and not explicitly confirmed, send warning
    if (isOverlap && confirmMerge !== 'true' && duplicateCount > 0) {
      return res.status(202).json({
        overlap_warning: true,
        message: `This uploaded file overlaps with transaction records (detected ${duplicateCount} duplicate transactions). Do you want to merge them, skipping duplicates?`,
        overlaps: overlaps.map(o => `${o.filename} (${o.start_date} to ${o.end_date})`),
        parsed_data: parseResult // Return the parsed response to avoid re-parsing on confirmation
      });
    }

    // 6. Proceed to commit transactions to DB
    const statementId = uuidv4();
    let insertedTxnCount = 0;
    let fraudCount = 0;

    // Filter duplicates if merge is confirmed
    for (const txn of transactions) {
      // Check if duplicate
      const dup = await get(
        `SELECT id FROM transactions 
         WHERE account_id = ? AND date = ? AND description = ? AND amount = ? AND type = ?`,
         [accountId, txn.date, txn.description, txn.amount, txn.type]
      );

      if (dup) {
        // Skip duplicate records
        continue;
      }

      const txnId = uuidv4();
      const status = txn.risk_level === 'High' ? 'Flagged as Fraud' : (txn.risk_level === 'Medium' ? 'Pending' : 'Transferred');
      const isFraud = txn.risk_level === 'High' ? 1 : 0;
      if (isFraud) fraudCount++;

      await run(
        `INSERT INTO transactions (id, statement_id, account_id, date, description, amount, type, category, status, risk_score, is_fraud, is_anomaly, fraud_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          txnId, statementId, accountId, txn.date, txn.description, txn.amount, txn.type,
          txn.category, status, txn.risk_score, txn.is_anomaly, txn.reasons.join(', ')
        ]
      );
      insertedTxnCount++;
    }

    // Create Statement record
    await run(
      `INSERT INTO statements (id, account_id, filename, start_date, end_date, status, transaction_count, fraud_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [statementId, accountId, req.file.originalname, minDateStr, maxDateStr, 'parsed', insertedTxnCount, fraudCount]
    );

    // 7. Update current Account balance using the chronologically latest transaction balance
    // Sort transactions by date descending to find the latest
    const sortedTxns = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestBalance = sortedTxns[0].balance;
    if (latestBalance !== undefined) {
      await run('UPDATE accounts SET balance = ? WHERE id = ?', [latestBalance, accountId]);
    }

    res.status(201).json({
      message: 'Bank statement parsed and transactions imported successfully.',
      statementId,
      insertedTransactions: insertedTxnCount,
      fraudDetected: fraudCount,
      newBalance: latestBalance
    });
  } catch (err) {
    console.error('Statement process error:', err);
    res.status(500).json({ error: 'Failed to process and store bank statement.' });
  }
});

// DELETE: Unlink/delete statement and delete associated transactions
router.delete('/:id', verifyToken, async (req, res) => {
  const statementId = req.params.id;

  try {
    // Verify ownership
    const statement = await get(
      `SELECT s.id FROM statements s
       JOIN accounts a ON s.account_id = a.id
       WHERE s.id = ? AND a.user_id = ?`,
      [statementId, req.user.id]
    );
    if (!statement) {
      return res.status(404).json({ error: 'Statement not found or access denied.' });
    }

    // Cascade delete transactions through database script
    await run('DELETE FROM transactions WHERE statement_id = ?', [statementId]);
    await run('DELETE FROM statements WHERE id = ?', [statementId]);

    res.json({ message: 'Statement records deleted successfully.' });
  } catch (err) {
    console.error('Delete statement error:', err);
    res.status(500).json({ error: 'Failed to delete statement log.' });
  }
});

module.exports = router;
