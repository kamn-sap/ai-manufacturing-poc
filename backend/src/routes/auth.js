const express = require('express');
const { AuthChallengeRequiredError, authProvider } = require('../lib/auth');
const { normalizeUsername } = require('../lib/passwords');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof password !== 'string' || password.length > 1024) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }

  try {
    const session = await authProvider.authenticate(normalizedUsername, password);
    if (!session) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
    }
    return res.json(session);
  } catch (error) {
    if (error instanceof AuthChallengeRequiredError) {
      return res.status(409).json({
        error: '追加認証が必要です。このログイン画面ではCognitoの追加認証に対応していません。',
        challenge: error.challengeName,
      });
    }
    throw error;
  }
});

module.exports = router;
