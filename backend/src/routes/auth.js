const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { run, get, query } = require('../db');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const REFRESH_SECRET = 'fraudshield_refresh_secret_token_202_dev';

// In-memory OTP storage for simplification (demo scale)
// Key: tempToken, Value: { userId, otp, expires }
const otpSessions = new Map();

// Helper to evaluate password strength
const evaluatePasswordStrength = (pwd) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  // Scale score to 0-4
  return Math.min(4, Math.max(0, score - 1));
};

// Signup Endpoint
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required fields.' });
  }

  const score = evaluatePasswordStrength(password);
  if (score < 2) {
    return res.status(400).json({ error: 'Password is too weak. Must satisfy at least 3 strength criteria.' });
  }

  try {
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await run(
      'INSERT INTO users (id, name, email, password_hash, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, ?, 1)',
      [userId, name, email.toLowerCase(), passwordHash, 'mock_otp_secret_123']
    );

    res.status(201).json({ message: 'User registration completed successfully. 2FA is enabled.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error occurred during registration.' });
  }
});

// Login Phase 1: Validate credentials and generate OTP
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2FA Setup
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const tempToken = uuidv4();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

    otpSessions.set(tempToken, { userId: user.id, otp, expires });

    // Print OTP to Node.js console for easy testing/demo
    console.log('\n======================================');
    console.log(`[SECURITY ALERT] Mock 2FA Code for ${user.email}:`);
    console.log(`>>> OTP: ${otp} <<<`);
    console.log('Valid for 5 minutes.');
    console.log('======================================\n');

    res.json({
      message: 'Credentials verified. Verification code has been sent.',
      tempToken,
      requires2FA: true
    });
  } catch (err) {
    console.error('Login phase 1 error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Login Phase 2: Verify OTP and issue JWT
router.post('/login/verify', async (req, res) => {
  const { tempToken, otp } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const clientDevice = req.headers['user-agent'] || 'Web Browser';

  if (!tempToken || !otp) {
    return res.status(400).json({ error: 'Temporary login token and OTP code are required.' });
  }

  const session = otpSessions.get(tempToken);
  if (!session) {
    return res.status(400).json({ error: 'Invalid or expired login session.' });
  }

  if (Date.now() > session.expires) {
    otpSessions.delete(tempToken);
    return res.status(400).json({ error: 'Verification code has expired. Please log in again.' });
  }

  if (session.otp !== otp) {
    return res.status(401).json({ error: 'Incorrect verification code. Please try again.' });
  }

  try {
    const user = await get('SELECT id, name, email FROM users WHERE id = ?', [session.userId]);
    otpSessions.delete(tempToken);

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Generate JWT access & refresh tokens
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    // Save Login Activity Log
    await run(
      'INSERT INTO login_activity (id, user_id, ip_address, device) VALUES (?, ?, ?, ?)',
      [uuidv4(), user.id, clientIp, clientDevice]
    );

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login verification error:', err);
    res.status(500).json({ error: 'Internal server error during 2FA verification.' });
  }
});

// Refresh Token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await get('SELECT id, email FROM users WHERE id = ?', [decoded.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User does not exist.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired refresh token.' });
  }
});

// Get Security Login Logs
router.get('/security-logs', verifyToken, async (req, res) => {
  try {
    const logs = await query(
      'SELECT ip_address, device, timestamp FROM login_activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20',
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    console.error('Security logs fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch security login logs.' });
  }
});

// Update Profile Password
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const score = evaluatePasswordStrength(newPassword);
  if (score < 2) {
    return res.status(400).json({ error: 'New password is too weak.' });
  }

  try {
    const user = await get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

module.exports = router;
