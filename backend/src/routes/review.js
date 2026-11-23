const crypto = require('node:crypto');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const express = require('express');
const { dynamo } = require('../lib/aws');
const { getResourceNames } = require('../lib/resource-names');
const { getDocument } = require('../lib/documents');
const { analyzeDesign } = require('../lib/llm');
const { getReviewSession, listFindings, saveFinding, saveReviewSession, updateFinding } = require('../lib/reviews');
const { getChunksByDocumentIds } = require('../lib/search');

const router = express.Router();
const reviewFindingsTable = getResourceNames().reviewFindings;

router.post('/sessions', async (req, res) => {
  const { documentIds } = req.body || {};
  if (
    !Array.isArray(documentIds)
    || documentIds.length === 0
    || documentIds.length > 10
    || documentIds.some((id) => typeof id !== 'string' || id.length > 128)
  ) {
    return res.status(400).json({ error: 'レビュー対象文書を1〜10件選択してください。' });
  }
  const uniqueIds = [...new Set(documentIds)];
  const documents = await Promise.all(uniqueIds.map((id) => getDocument(id)));
  if (documents.some((document) => !document || document.status !== 'ready' || document.kind !== 'design')) {
    return res.status(400).json({ error: '取り込み済みの設計文書のみレビュー対象にできます。' });
  }
  const session = {
    id: crypto.randomUUID(),
    documentIds: uniqueIds,
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveReviewSession(session);
  return res.status(201).json({ session });
});

router.get('/:id', async (req, res) => {
  const session = await getReviewSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'レビューセッションが見つかりません。' });
  return res.json({ session, findings: await listFindings(session.id) });
});

router.post('/:id/analyze', async (req, res) => {
  const session = await getReviewSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'レビューセッションが見つかりません。' });
  if (session.status === 'analyzed') {
    return res.json({ session, findings: await listFindings(session.id) });
  }
  const chunks = getChunksByDocumentIds(session.documentIds, 12);
  const candidates = chunks.length
    ? await analyzeDesign({ chunks })
    : { perspectives: ['要求との整合性', '安全性', '異常系と復旧', '保守性', '検証可能性'], findings: [], qualityRisks: [], testPoints: [], similarCases: [] };
  const documents = new Map((await Promise.all(
    [...new Set(chunks.map((chunk) => chunk.document_id))]
      .map(async (id) => [id, await getDocument(id)]),
  )).filter(([, document]) => document));
  const findings = [];
  for (const candidate of candidates.findings) {
    const finding = {
      ...candidate,
      id: crypto.randomUUID(),
      sessionId: session.id,
      disposition: 'pending',
      createdAt: new Date().toISOString(),
      evidence: {
        documentId: candidate.evidence.document_id,
        documentName: documents.get(candidate.evidence.document_id)?.fileName || '登録文書',
        section: candidate.evidence.section,
        page: candidate.evidence.page,
        excerpt: candidate.evidence.content.slice(0, 360),
      },
    };
    await saveFinding(finding);
    findings.push(finding);
  }
  const updatedSession = {
    ...session,
    status: 'analyzed',
    updatedAt: new Date().toISOString(),
    perspectives: candidates.perspectives,
    qualityRisks: candidates.qualityRisks,
    testPoints: candidates.testPoints,
    similarCases: candidates.similarCases.map((chunk) => ({
      documentName: documents.get(chunk.document_id)?.fileName || '登録文書',
      section: chunk.section,
      excerpt: chunk.content.slice(0, 200),
    })),
  };
  await saveReviewSession(updatedSession);
  return res.json({ session: updatedSession, findings });
});

router.patch('/findings/:id', async (req, res) => {
  const { disposition, editedText } = req.body || {};
  if (!['accepted', 'rejected', 'edited'].includes(disposition)) {
    return res.status(400).json({ error: '採用・却下・修正のいずれかを指定してください。' });
  }
  if (disposition === 'edited' && (typeof editedText !== 'string' || !editedText.trim())) {
    return res.status(400).json({ error: '修正内容を入力してください。' });
  }
  const existing = await dynamo.send(new GetCommand({
    TableName: reviewFindingsTable,
    Key: { id: req.params.id },
  }));
  if (!existing.Item) return res.status(404).json({ error: '指摘候補が見つかりません。' });
  const result = await updateFinding(req.params.id, {
    disposition,
    ...(disposition === 'edited' ? { editedText: editedText.trim().slice(0, 4000) } : {}),
    reviewedAt: new Date().toISOString(),
  });
  return res.json({ finding: result });
});

module.exports = router;
