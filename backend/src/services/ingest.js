const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const XLSX = require('xlsx');
const db = require('../db');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx', '.xlsx']);
const CHUNK_SIZE = 1100;

function fileExtension(fileName) {
  return fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
}

async function extractDocument(buffer, fileName) {
  const extension = fileExtension(fileName);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported document format: ${extension || '(no extension)'}`);
  }
  if (extension === '.txt' || extension === '.md' || extension === '.markdown') {
    return [{ section: '本文', page: 1, text: buffer.toString('utf8') }];
  }
  if (extension === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const pages = result.pages.map(({ num, text }) => ({
        section: '本文',
        page: num,
        text,
      })).filter((page) => page.text.trim());
      return pages.length ? pages : [{ section: '本文', page: 1, text: result.text }];
    } finally {
      await parser.destroy();
    }
  }
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return [{ section: '本文', page: null, text: result.value }];
  }
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name) => ({
    section: name,
    page: null,
    text: XLSX.utils.sheet_to_csv(workbook.Sheets[name]),
  }));
}

function splitIntoChunks(sections, documentId) {
  const chunks = [];
  for (const section of sections) {
    let activeSection = section.section;
    let pending = '';
    const flush = () => {
      const content = pending.trim();
      if (content) chunks.push({ document_id: documentId, section: activeSection, page: section.page, content });
      pending = '';
    };
    for (let line of section.text.split(/\r?\n/)) {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flush();
        activeSection = heading[1].slice(0, 120);
        continue;
      }
      if (pending && pending.length + line.length + 1 > CHUNK_SIZE) flush();
      while (line.length > CHUNK_SIZE) {
        pending = line.slice(0, CHUNK_SIZE);
        flush();
        line = line.slice(CHUNK_SIZE);
      }
      if (line) pending = `${pending}${pending ? '\n' : ''}${line}`;
    }
    flush();
  }
  return chunks;
}

function indexChunks(documentId, chunks) {
  const insert = db.prepare(`
    INSERT INTO document_chunks (document_id, section, page, content)
    VALUES (@document_id, @section, @page, @content)
  `);
  const replace = db.transaction((items) => {
    db.prepare('DELETE FROM document_chunks WHERE document_id = ?').run(documentId);
    for (const chunk of items) insert.run(chunk);
  });
  replace(chunks);
}

async function ingestDocument(document) {
  const { getObjectBuffer } = require('../routes/files');
  const buffer = await getObjectBuffer(document.storageKey);
  const sections = await extractDocument(buffer, document.fileName);
  const chunks = splitIntoChunks(sections, document.id);
  if (!chunks.length) throw new Error('No searchable text was found in the document');
  indexChunks(document.id, chunks);
  return { chunkCount: chunks.length };
}

module.exports = { extractDocument, indexChunks, ingestDocument, splitIntoChunks };
