const { initDb, get, query } = require('./src/db');

const testBackend = async () => {
  console.log('=================================================');
  console.log('Starting Node.js Backend Database Tests...');
  console.log('=================================================');

  try {
    // 1. Initialize SQLite Database (runs seeding if empty)
    await initDb();

    // 2. Query seeded user
    const user = await get('SELECT id, name, email FROM users WHERE email = ?', ['demo@fraudshield.com']);
    if (!user) {
      throw new Error('Verification failed: Demo user not seeded.');
    }
    console.log(`- Verified User: Name="${user.name}", Email="${user.email}"`);

    // 3. Query seeded accounts
    const accounts = await query('SELECT bank_name, account_number, balance FROM accounts WHERE user_id = ?', [user.id]);
    console.log(`- Verified Accounts Linked: ${accounts.length}`);
    accounts.forEach(acc => {
      console.log(`  * Bank: ${acc.bank_name}, A/C: ${acc.account_number}, Bal: $${acc.balance}`);
    });
    
    if (accounts.length === 0) {
      throw new Error('Verification failed: Linked accounts count is 0.');
    }

    // 4. Query seeded transactions
    const txnSum = await get('SELECT COUNT(*) as count, SUM(amount) as total FROM transactions');
    console.log(`- Verified Transactions Count: ${txnSum.count}`);
    
    if (txnSum.count === 0) {
      throw new Error('Verification failed: Transaction log count is 0.');
    }

    console.log('\n=================================================');
    console.log('Database and Seeding Verification Passed successfully!');
    console.log('=================================================');
  } catch (err) {
    console.error('\nBackend Database Verification Failed:', err.message);
    process.exit(1);
  }
};

testBackend();
