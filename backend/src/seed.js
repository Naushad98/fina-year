const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seedDatabase = async (dbRun, dbGet, dbQuery) => {
  try {
    console.log('Seeding mock data for final-year project demonstration...');

    // 1. Create Mock User
    const demoEmail = 'demo@fraudshield.com';
    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [demoEmail]);
    
    if (existingUser) {
      console.log('Database already populated. Skipping seed.');
      return;
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('Password@123', 10);
    
    await dbRun(
      'INSERT INTO users (id, name, email, password_hash, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, ?, 1)',
      [userId, 'Demo Administrator', demoEmail, passwordHash, 'mock_otp_secret_123']
    );
    console.log('- Seeded User: demo@fraudshield.com / Password@123');

    // 2. Create Bank Accounts
    const accounts = [
      {
        id: uuidv4(),
        bank_name: 'Chase Checking',
        account_number: '********5541',
        hash: '5541_hash_chase_checking',
        type: 'Checking',
        routing: '021000021',
        balance: 35000.00,
        is_primary: 1
      },
      {
        id: uuidv4(),
        bank_name: 'Ally Savings',
        account_number: '********9923',
        hash: '9923_hash_ally_savings',
        type: 'Savings',
        routing: '091000019',
        balance: 45800.00,
        is_primary: 0
      },
      {
        id: uuidv4(),
        bank_name: 'Capital One Card',
        account_number: '********8812',
        hash: '8812_hash_capone_cc',
        type: 'Credit Card',
        routing: null,
        balance: -1240.50,
        is_primary: 0
      }
    ];

    for (const acc of accounts) {
      await dbRun(
        `INSERT INTO accounts (id, user_id, bank_name, account_number, raw_account_number_hash, account_type, routing_number, balance, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [acc.id, userId, acc.bank_name, acc.account_number, acc.hash, acc.type, acc.routing, acc.balance, acc.is_primary]
      );
    }
    console.log(`- Seeded ${accounts.length} linked bank accounts.`);

    const primaryAccountId = accounts[0].id;
    const savingsAccountId = accounts[1].id;
    const ccAccountId = accounts[2].id;

    // 3. Create Login activity
    await dbRun(
      'INSERT INTO login_activity (id, user_id, ip_address, device) VALUES (?, ?, ?, ?)',
      [uuidv4(), userId, '192.168.1.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0']
    );

    // 4. Generate transaction logs chronologically
    const txns = [];
    const baseDate = new Date();
    
    // Generate transactions spanning 30 days back
    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];

      // Monthly recurring credits
      if (dayOffset === 30) {
        // Salary
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 09:30:00`,
          description: 'CORP PAYROLL / DIR DEP SALARY',
          amount: 5200.00,
          type: 'credit',
          category: 'Salary',
          status: 'Transferred',
          risk_score: 0.0,
          is_anomaly: 0,
          fraud_reason: 'Safe: Standard monthly credit matching expected payroll parameters.'
        });
      }

      // Normal spends: Grocery every few days
      if (dayOffset % 4 === 0) {
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 15:45:00`,
          description: 'WHOLE FOODS MKT #1294',
          amount: 142.30 + (dayOffset % 3) * 15,
          type: 'debit',
          category: 'Dining & Entertainment',
          status: 'Transferred',
          risk_score: 5.5,
          is_anomaly: 0,
          fraud_reason: 'Safe: Recurrent merchant matching household spending category.'
        });
      }

      // Normal spends: Dining out on weekends
      if (dayOffset % 7 === 0 || dayOffset % 7 === 1) {
        txns.push({
          id: uuidv4(),
          account_id: ccAccountId,
          date: `${dateStr} 20:15:00`,
          description: 'STARBUCKS COFFEE / DOWNTOWN',
          amount: 14.50,
          type: 'debit',
          category: 'Dining & Entertainment',
          status: 'Transferred',
          risk_score: 2.1,
          is_anomaly: 0,
          fraud_reason: 'Safe: Low-value merchant check.'
        });
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 21:00:00`,
          description: 'THE GRILLHOUSE RESTAURANT',
          amount: 85.00 + (dayOffset % 5) * 8,
          type: 'debit',
          category: 'Dining & Entertainment',
          status: 'Transferred',
          risk_score: 11.2,
          is_anomaly: 0,
          fraud_reason: 'Safe: Standard recreation expense.'
        });
      }

      // Normal spends: Utility bill monthly
      if (dayOffset === 15) {
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 10:00:00`,
          description: 'ELECTRICITY BILL BESCOM WIRE',
          amount: 120.45,
          type: 'debit',
          category: 'Utility',
          status: 'Transferred',
          risk_score: 8.5,
          is_anomaly: 0,
          fraud_reason: 'Safe: Standard monthly wire matching utility baselines.'
        });
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 11:30:00`,
          description: 'NETFLIX ONLINE SUBSCRIPTION',
          amount: 15.49,
          type: 'debit',
          category: 'Dining & Entertainment',
          status: 'Transferred',
          risk_score: 1.5,
          is_anomaly: 0,
          fraud_reason: 'Safe: Low-value recurring digital transaction.'
        });
      }

      // 5. INJECT ANOMALIES & MOCK FRAUD RECORDINGS
      
      // Anomaly 1: Spike transfer debit
      if (dayOffset === 22) {
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 14:20:00`,
          description: 'UPI WIRE TO MULE_ACCOUNT_99',
          amount: 12500.00,
          type: 'debit',
          category: 'Transfer',
          status: 'Flagged as Fraud',
          risk_score: 82.5,
          is_anomaly: 1,
          fraud_reason: 'Amount spike: Transaction amount is 8.2x higher than historical averages. Blacklist match: Description maps to high-risk account Mule coordinates.'
        });
      }

      // Anomaly 2: Odd hour Cash withdrawal
      if (dayOffset === 10) {
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 03:14:00`,
          description: 'ATM CASH WITHDRAWAL DOWNTOWN',
          amount: 5000.00,
          type: 'debit',
          category: 'Cash',
          status: 'Pending',
          risk_score: 55.4,
          is_anomaly: 1,
          fraud_reason: 'Odd-hour transaction: Debit processed at 03:00 hours. Round number: Large round amount ($5000) which is common in quick card-cloning scams.'
        });
      }

      // Anomaly 3: Rapid Duplicate UPIs
      if (dayOffset === 5) {
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 18:30:00`,
          description: 'UPI WIRE TRANSFER TO MERCHANT',
          amount: 2500.00,
          type: 'debit',
          category: 'UPI',
          status: 'Transferred',
          risk_score: 18.0,
          is_anomaly: 0,
          fraud_reason: 'Safe: Initial merchant check.'
        });
        // Duplicate 1 minute later
        txns.push({
          id: uuidv4(),
          account_id: primaryAccountId,
          date: `${dateStr} 18:31:00`,
          description: 'UPI WIRE TRANSFER TO MERCHANT',
          amount: 2500.00,
          type: 'debit',
          category: 'UPI',
          status: 'Pending',
          risk_score: 65.0,
          is_anomaly: 1,
          fraud_reason: 'Duplicate: Identical amount and category detected in rapid succession (1 minute interval).'
        });
      }
    }

    // Insert all transactions into transactions SQLite table
    // To maintain chronological order, sort ascending
    txns.sort((a, b) => new Date(a.date) - new Date(b.date));

    let balanceAccum = accounts[0].balance; // track checking
    
    for (const txn of txns) {
      // Recalculate balances correctly to avoid layout offsets
      if (txn.account_id === primaryAccountId) {
        if (txn.type === 'credit') balanceAccum += txn.amount;
        else balanceAccum -= txn.amount;
        txn.balance = balanceAccum;
      } else {
        txn.balance = txn.account_id === savingsAccountId ? 45800.00 : -1240.50;
      }

      await dbRun(
        `INSERT INTO transactions (id, statement_id, account_id, date, description, amount, type, category, status, risk_score, is_fraud, is_anomaly, fraud_reason)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          txn.id, txn.account_id, txn.date, txn.description, txn.amount, txn.type,
          txn.category, txn.status, txn.risk_score, txn.is_anomaly, txn.fraud_reason
        ]
      );
    }
    
    // Update active checking account balance to match final calculation
    await dbRun('UPDATE accounts SET balance = ? WHERE id = ?', [balanceAccum, primaryAccountId]);

    console.log(`- Seeded ${txns.length} historical transaction logs with injected fraud points.`);
    console.log('Seeding successfully finished.');
  } catch (err) {
    console.error('Database seeding error occurred:', err);
  }
};

module.exports = { seedDatabase };
