require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const transferRoutes = require('./routes/transfers');
const statementRoutes = require('./routes/statements');
const fraudRoutes = require('./routes/fraud');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // Allows connections from standard development clients
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// General Rate Limiter (Safety)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per window
  message: { error: 'Too many requests from this IP. Please try again later.' }
});
app.use('/api/', apiLimiter);

// Strict Rate Limiting on login/signup (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // limit to 30 attempts
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/analytics', analyticsRoutes);

// Base health route
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Bootstrapping function
const startServer = async () => {
  try {
    // 1. Initialize SQLite Database
    await initDb();
    
    // 2. Start server listener
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`FraudShield Node Backend active on port: ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Failed to boot backend service:', err.message);
    process.exit(1);
  }
};

startServer();
