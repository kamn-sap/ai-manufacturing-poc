const db = require('../db');

function searchChunks(text, documentIds = [], limit = 8) {
  const terms = (text.match(/[\p{L}\p{N}_]+/gu) || [])
    .flatMap((term) => {
      const characters = Array.from(term);
      if (characters.length < 3) return [];
      const trigrams = [];
      for (let index = 0; index <= characters.length - 3; index += 2) {
        trigrams.push(characters.slice(index, index + 3).join(''));
      }
      if (characters.length >= 3 && trigrams.at(-1) !== characters.slice(-3).join('')) {
        trigrams.push(characters.slice(-3).join(''));
      }
      return trigrams;
    });
  if (!terms.length) {
    const phrase = text.trim().replaceAll('%', '\\%').replaceAll('_', '\\_');
    return db.prepare(`
      SELECT document_id, section, page, content
      FROM document_chunks
      WHERE content LIKE ? ESCAPE '\\'
      ${documentIds.length ? `AND document_id IN (${documentIds.map(() => '?').join(', ')})` : ''}
      ORDER BY rowid
      LIMIT ?
    `).all(`%${phrase}%`, ...documentIds, limit);
  }
  const match = [...new Set(terms)].map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
  const ids = [...new Set(documentIds)];
  const filter = ids.length ? `AND document_id IN (${ids.map(() => '?').join(', ')})` : '';
  return db.prepare(`
    SELECT document_id, section, page, content, bm25(document_chunks) AS score
    FROM document_chunks
    WHERE document_chunks MATCH ? ${filter}
    ORDER BY score
    LIMIT ?
  `).all(match, ...ids, limit).map(({ score: _score, ...chunk }) => chunk);
}

function getChunksByDocumentIds(documentIds, limit = 12) {
  const ids = [...new Set(documentIds)];
  if (!ids.length) return [];
  return db.prepare(`
    SELECT document_id, section, page, content
    FROM document_chunks
    WHERE document_id IN (${ids.map(() => '?').join(', ')})
    ORDER BY rowid
    LIMIT ?
  `).all(...ids, limit);
}

module.exports = { getChunksByDocumentIds, searchChunks };
