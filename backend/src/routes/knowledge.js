const crypto = require('node:crypto');
const path = require('node:path');
const { GetQueueUrlCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const express = require('express');
const { sqs } = require('../lib/aws');
const { getDocument, listDocuments, saveDocument, updateDocument } = require('../lib/documents');
const { answerQuestion } = require('../lib/llm');
const { searchChunks } = require('../lib/search');
const db = require('../db');
const { createDownloadUrl, createUploadUrl } = require('./files');

const router = express.Router();
const supportedExtensions = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx', '.xlsx']);
const mimeTypes = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

router.post('/upload-url', async (req, res) => {
  const { fileName, kind } = req.body || {};
  if (typeof fileName !== 'string' || fileName.length > 255) {
    return res.status(400).json({ error: 'ファイル名を指定してください。' });
  }
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return res.status(400).json({ error: '対応形式はTXT、Markdown、PDF、DOCX、XLSXです。' });
  }
  if (kind && !['work-instruction', 'manual', 'faq', 'trouble-history', 'design'].includes(kind)) {
    return res.status(400).json({ error: '文書種別が不正です。' });
  }
  const id = crypto.randomUUID();
  const storageKey = `documents/${id}/${path.basename(fileName)}`;
  const document = {
    id,
    fileName: path.basename(fileName),
    kind: kind || 'manual',
    version: 1,
    contentType: mimeTypes[extension],
    storageKey,
    status: 'uploading',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveDocument(document);
  const uploadUrl = await createUploadUrl(storageKey, document.contentType);
  return res.status(201).json({ document, uploadUrl, uploadHeaders: { 'Content-Type': document.contentType } });
});

router.post('/:id/complete', async (req, res) => {
  const document = await getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: '文書が見つかりません。' });
  if (document.status !== 'uploading') {
    return res.status(409).json({ error: 'この文書はすでに取り込み処理中または完了しています。' });
  }
  const queueUrl = process.env.DOC_INGEST_QUEUE_URL
    || (await sqs.send(new GetQueueUrlCommand({ QueueName: 'doc-ingest-queue' }))).QueueUrl;
  const updated = await updateDocument(document.id, {
    status: 'queued',
    updatedAt: new Date().toISOString(),
  });
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ documentId: document.id }),
    }));
  } catch (error) {
    await updateDocument(document.id, {
      status: 'failed',
      error: error.message,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
  return res.status(202).json({ document: updated });
});

router.get('/', async (_req, res) => {
  const documents = await listDocuments();
  return res.json({ documents });
});

router.get('/:id/download-url', async (req, res) => {
  const document = await getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: '文書が見つかりません。' });
  return res.json({ url: await createDownloadUrl(document.storageKey) });
});

router.post('/ask', async (req, res) => {
  const { question } = req.body || {};
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) {
    return res.status(400).json({ error: '質問を入力してください（2,000文字以内）。' });
  }
  const chunks = searchChunks(question.trim());
  if (!chunks.length) {
    return res.json({
      answer: '該当資料を確認できません。登録済み資料を追加するか、質問を具体的にしてください。',
      steps: [],
      safetyNotes: ['安全に関わる場合は、承認済みの原文と現場の安全手順を確認してください。'],
      similarCases: [],
      citations: [],
    });
  }
  const answer = await answerQuestion({ question: question.trim(), chunks });
  const documents = new Map((await Promise.all(
    [...new Set(answer.citations.map((chunk) => chunk.document_id))]
      .map(async (id) => [id, await getDocument(id)]),
  )).filter(([, document]) => document));
  const citations = answer.citations.map((chunk) => ({
    documentId: chunk.document_id,
    documentName: documents.get(chunk.document_id)?.fileName || '登録文書',
    section: chunk.section,
    page: chunk.page,
    excerpt: chunk.content.slice(0, 360),
  }));
  return res.json({ ...answer, citations });
});

router.post('/feedback', (req, res) => {
  const { question, helpful } = req.body || {};
  if (typeof question !== 'string' || typeof helpful !== 'boolean') {
    return res.status(400).json({ error: '質問と評価（役に立ったか）を指定してください。' });
  }
  db.prepare(`
    INSERT INTO knowledge_feedback (id, question, helpful, created_at) VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), question.slice(0, 2000), helpful ? 1 : 0, new Date().toISOString());
  return res.status(201).json({ recorded: true });
});

module.exports = router;
