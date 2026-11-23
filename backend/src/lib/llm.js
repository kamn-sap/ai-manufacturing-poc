const PROVIDERS = new Map([
  ['mock', {
    async answer({ question, chunks }) {
      const evidence = chunks.slice(0, 3);
      return {
        answer: `「${question}」について、登録資料の該当箇所を確認してください。以下の引用が確認できた根拠です。`,
        steps: evidence.map((chunk) => chunk.content.slice(0, 180)),
        safetyNotes: ['安全に関わる作業は、承認済みの原文と現場の安全手順を必ず確認してください。'],
        similarCases: evidence
          .filter((chunk) => /faq|trouble|事例|トラブル|faq/i.test(chunk.section))
          .map((chunk) => chunk.content.slice(0, 180)),
        citations: evidence,
      };
    },
    async analyze({ chunks }) {
      const evidence = chunks.slice(0, 4);
      const findings = evidence.map((chunk, index) => ({
        title: `確認候補 ${index + 1}`,
        category: ['安全性', '仕様整合性', '保守性', 'テスト容易性'][index % 4],
        description: `設計記述を根拠箇所と照合し、前提と要求への適合を確認してください: ${chunk.content.slice(0, 140)}`,
        qualityRisk: '記載の前提が未確認の場合、実装や運用時に期待との不一致が生じる可能性があります。',
        testPoint: `根拠箇所「${chunk.section}」の前提条件と正常系・異常系の動作を確認する。`,
        evidence: chunk,
      }));
      return {
        perspectives: ['要求との整合性', '安全性', '異常系と復旧', '保守性', '検証可能性'],
        findings,
        qualityRisks: findings.map((finding) => finding.qualityRisk),
        testPoints: findings.map((finding) => finding.testPoint),
        similarCases: evidence.slice(0, 2),
      };
    },
  }],
]);

function provider() {
  const name = process.env.LLM_PROVIDER || 'mock';
  const selected = PROVIDERS.get(name);
  if (!selected) {
    throw new Error(`LLM_PROVIDER "${name}" is not configured. Only the deterministic mock provider is available in this PoC.`);
  }
  return selected;
}

async function answerQuestion(input) {
  return provider().answer(input);
}

async function analyzeDesign(input) {
  return provider().analyze(input);
}

module.exports = { analyzeDesign, answerQuestion };
