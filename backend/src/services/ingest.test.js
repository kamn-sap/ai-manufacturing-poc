import { describe, expect, it } from 'vitest';
import { extractDocument, splitIntoChunks } from './ingest.js';

function createPdfFixture() {
  const stream = 'BT /F1 12 Tf 10 100 Td (Sample PDF text) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(content);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += `${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content);
}

describe('document ingestion helpers', () => {
  it('extracts PDF pages with their physical page numbers', async () => {
    const pages = await extractDocument(createPdfFixture(), 'sample.pdf');

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ section: '本文', page: 1 });
    expect(pages[0].text).toContain('Sample PDF text');
  });
  it('splits Markdown by heading and keeps its page reference', () => {
    const chunks = splitIntoChunks([{
      section: '本文',
      page: 2,
      text: '# 安全確認\n電源を遮断します。\n# 再起動\n責任者の確認後に実施します。',
    }], 'doc-1');

    expect(chunks).toEqual([
      { document_id: 'doc-1', section: '安全確認', page: 2, content: '電源を遮断します。' },
      { document_id: 'doc-1', section: '再起動', page: 2, content: '責任者の確認後に実施します。' },
    ]);
  });

  it('rejects file types outside the stated extraction scope', async () => {
    await expect(extractDocument(Buffer.from('video'), 'training.mp4'))
      .rejects.toThrow('Unsupported document format');
  });

  it('keeps long input chunks within the configured maximum', () => {
    const chunks = splitIntoChunks([{ section: '本文', page: 1, text: 'a'.repeat(2400) }], 'doc-2');
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.content.length))).toBeLessThanOrEqual(1100);
    expect(chunks.map((chunk) => chunk.content).join('')).toBe('a'.repeat(2400));
  });
});
