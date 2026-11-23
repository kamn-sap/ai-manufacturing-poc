const express = require('express');
const { createToken } = require('../lib/auth');
const { normalizeUsername, verifyPassword } = require('../lib/passwords');
const { findUser } = require('../services/users');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof password !== 'string' || password.length > 1024) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }

  const user = await findUser(normalizedUsername);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }
  return res.json({ token: createToken(user.username), username: user.username });
});

module.exports = router;
