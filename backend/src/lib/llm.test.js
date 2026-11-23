import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from './llm.js';

const chunks = [
  { document_id: 'doc-1', section: '始業前確認', page: 1, content: '周囲を確認します。' },
  { document_id: 'doc-2', section: 'FAQ', page: 2, content: '異常時は停止します。' },
];

function ollamaResponse(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { message: { content: JSON.stringify(content) } };
    },
  };
}

describe('Ollama LLM provider', () => {
  it('uses supplied citations and a general safety note', async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse({
      answer: '資料では周囲を確認するとしています。',
      steps: ['周囲を確認する'],
      safetyNotes: [],
    }));
    const provider = createOllamaProvider({
      model: 'test-model',
      fetchImpl,
    });

    const result = await provider.answer({ question: '確認方法は？', chunks });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);

    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    expect(request.stream).toBe(false);
    expect(result.citations).toEqual(chunks);
    expect(result.safetyNotes).toContain('安全に関わる内容は、承認済みの原文と適用される安全手順を必ず確認してください。');
    expect(result.similarCases).toEqual(['異常時は停止します。']);
  });

  it('maps design findings to the referenced source chunk', async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse({
      perspectives: ['安全性'],
      findings: [{
        title: '停止条件',
        category: '安全性',
        description: '停止条件を確認する',
        qualityRisk: '停止条件が曖昧',
        testPoint: '異常時の停止を検証する',
        evidenceIndex: 1,
      }],
    }));
    const provider = createOllamaProvider({ model: 'test-model', fetchImpl });

    const result = await provider.analyze({ chunks });

    expect(result.findings[0].evidence).toEqual(chunks[1]);
    expect(result.qualityRisks).toEqual(['停止条件が曖昧']);
    expect(result.testPoints).toEqual(['異常時の停止を検証する']);
  });

  it('rejects public endpoints and invalid evidence references', async () => {
    expect(() => createOllamaProvider({
      baseUrl: 'https://example.com',
      model: 'test-model',
      fetchImpl: vi.fn(),
    })).toThrow('loopback or private IP address');

    const fetchImpl = vi.fn(async () => ollamaResponse({
      perspectives: ['安全性'],
      findings: [{
        title: '指摘',
        category: '安全性',
        description: '確認する',
        qualityRisk: '見逃し',
        testPoint: '試験する',
        evidenceIndex: 3,
      }],
    }));
    const provider = createOllamaProvider({ model: 'test-model', fetchImpl });

    await expect(provider.analyze({ chunks })).rejects.toThrow('invalid evidenceIndex');
  });
});
