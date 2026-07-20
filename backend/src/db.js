const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { seedDatabase } = require('./seed');

const dbPath = path.resolve(__dirname, '../database.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Failed to enable foreign keys:', err);
    });
  }
});

// Promisify database actions for async/await usage
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Database initialization schema
const initDb = async () => {
  console.log('Initializing database schema...');

  // Users Table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      two_factor_secret TEXT,
      two_factor_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Accounts Table
  await run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      raw_account_number_hash TEXT NOT NULL,
      account_type TEXT NOT NULL,
      routing_number TEXT,
      balance REAL DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Statements Table
  await run(`
    CREATE TABLE IF NOT EXISTS statements (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL,
      transaction_count INTEGER DEFAULT 0,
      fraud_count INTEGER DEFAULT 0,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Transactions Table
  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      statement_id TEXT,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      risk_score REAL DEFAULT 0,
      is_fraud INTEGER DEFAULT 0,
      is_anomaly INTEGER DEFAULT 0,
      fraud_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(statement_id) REFERENCES statements(id) ON DELETE SET NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Transfers Table
  await run(`
    CREATE TABLE IF NOT EXISTS transfers (
      id PRIMARY KEY,
      user_id TEXT NOT NULL,
      from_account_id TEXT NOT NULL,
      to_account_name TEXT NOT NULL,
      to_account_number TEXT NOT NULL,
      to_routing_number TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      risk_level TEXT NOT NULL,
      risk_score REAL NOT NULL,
      risk_reason TEXT,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(from_account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Login Activity Table
  await run(`
    CREATE TABLE IF NOT EXISTS login_activity (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      device TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Database schema successfully initialized.');
  
  // Seed initial demo data if empty
  await seedDatabase(run, get, query);
};

module.exports = {
  db,
  query,
  get,
  run,
  initDb
};
