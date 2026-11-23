const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '../..');
const configuredPath = process.env.SQLITE_PATH || '.data/manufacturing.db';
const databasePath = configuredPath === ':memory:' ? configuredPath : path.resolve(projectRoot, configuredPath);
if (databasePath !== ':memory:') {
  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
}

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks USING fts5(
    document_id UNINDEXED,
    section UNINDEXED,
    page UNINDEXED,
    content,
    tokenize = 'trigram'
  );
  CREATE TABLE IF NOT EXISTS knowledge_feedback (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    helpful INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

module.exports = db;
