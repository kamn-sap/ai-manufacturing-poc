const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production');
}

function createToken(username) {
  return jwt.sign({ sub: username }, jwtSecret || 'local-development-secret', { expiresIn: '8h' });
}

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  try {
    req.user = jwt.verify(token, jwtSecret || 'local-development-secret');
    next();
  } catch {
    res.status(401).json({ error: '認証が必要です。再度ログインしてください。' });
  }
}

module.exports = { createToken, requireAuth };
