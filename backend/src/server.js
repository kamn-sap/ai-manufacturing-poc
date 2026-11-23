require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });
const cors = require('cors');
const express = require('express');
const { requireAuth } = require('./lib/auth');
const authRoutes = require('./routes/auth');
const knowledgeRoutes = require('./routes/knowledge');
const reviewRoutes = require('./routes/review');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/knowledge', requireAuth, knowledgeRoutes);
app.use('/api/review', requireAuth, reviewRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'サーバーで処理に失敗しました。' });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`API listening on port ${port}`));
}

module.exports = app;
