import { beforeAll, describe, expect, it } from 'vitest';

process.env.SQLITE_PATH = ':memory:';

const db = require('../db');
const { searchChunks } = require('./search');

describe('FTS5 search', () => {
  beforeAll(() => {
    db.prepare(`
      INSERT INTO document_chunks (document_id, section, page, content)
      VALUES (?, ?, ?, ?)
    `).run('doc-1', '異音対応', 2, 'ポンプに異音が発生した場合は設備を停止します。');
    db.prepare(`
      INSERT INTO document_chunks (document_id, section, page, content)
      VALUES (?, ?, ?, ?)
    `).run('doc-2', '点検', 1, '非常停止ボタンの状態を点検します。');
  });

  it('finds Japanese text and preserves section and page references', () => {
    const results = searchChunks('ポンプ 異音');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ document_id: 'doc-1', section: '異音対応', page: 2 });
  });

  it('does not issue malformed FTS queries for short terms', () => {
    expect(searchChunks('異音')).toHaveLength(1);
  });
});
