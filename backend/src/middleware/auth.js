const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fraudshield_jwt_secret_token_101_dev';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token is required. Authentication failed.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired access token.' });
  }
};

module.exports = {
  verifyToken,
  JWT_SECRET
};
