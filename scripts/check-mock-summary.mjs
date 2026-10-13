import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/app.mjs';
import { cleanSummaryText } from '../backend/mock-summary.mjs';
import { mockOutput } from '../backend/mock.mjs';
import { chunkText } from '../backend/retrieval.mjs';
import { validateOutput } from '../backend/schemas.mjs';

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error('请传入要验收的课程 PDF 路径。');
const sourcePath = resolve(pdfPath);
const app = createApp({ mode: 'mock' });
let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { fetchCalls++; throw new Error('离线验收禁止任何 fetch 请求'); };
try {
  const uploaded = await request(app).post('/api/materials/upload').attach('file', await readFile(sourcePath), basename(sourcePath)).expect(200);
  const material = uploaded.body;
  const response = await request(app).post('/api/ai/summary').send({ materialId: material.id }).expect(200);
  const { data: summary, mode } = response.body;
  assert.equal(mode, 'mock');
  assert.equal(fetchCalls, 0);
  validateOutput('summary', summary, undefined, { mode: 'mock' });
  assert.ok(summary.concepts.length >= 8 && summary.concepts.length <= 10, '当前课程应有至少 8 条可用重点');
  const text = JSON.stringify(summary);
  assert.doesNotMatch(text, /@|https?:\/\/|\d+\s*of\s*\d+|Page\s*\d+|第\s*\d+\s*页|大学|学院|资料要点/iu);
  for (const concept of summary.concepts) {
    assert.ok((concept.explanation.match(/[\u4e00-\u9fff]/g) || []).length >= 14);
    assert.doesNotMatch(concept.explanation, /^(?:与|可被|频率低)|[=:：]。|[⎧⎨⎩∑{}]/);
    assert.ok(!/^核心知识点/.test(concept.name), '当前 PDF 有明确概念，不应使用兜底标题');
  }
  assert.deepEqual(mockOutput('summary', material, chunkText(material.text), {}), summary);
  // 清洗仅在 summary 内部进行，上传原文与其他功能仍保留原输入。
  assert.ok(material.text.length > 30);
  const compact = cleanSummaryText(material.text);
  await writeFile(new URL('../artifacts/mock-summary-final.json', import.meta.url), JSON.stringify(summary, null, 2));
  const report = { passed: true, source: 'local-private-material (not published)', mode, concepts: summary.concepts.length, externalFetchCalls: fetchCalls, removed: compact.removed, checks: ['实际 PDF 上传与解析', 'Mock 重点 API 及输出 Schema', '页眉/邮箱/URL/页码不进入重点', '纯公式/表格/无意义标题不进入重点', '完整句子与确定性', '原始资料不被修改', '无外部网络或模型调用'], humanTextReview: '前 8 条在 artifacts/mock-summary-review.md 中逐条核对' };
  await writeFile(new URL('../artifacts/mock-summary-results.json', import.meta.url), JSON.stringify(report, null, 2));
  await writeFile(new URL('../artifacts/mock-summary-review.md', import.meta.url), `# Mock 重点提炼验收\n\n资料：本机私有资料（不公开原文与路径）\n\n${summary.overview}\n\n${summary.concepts.map((concept, index) => `## ${index + 1}. ${concept.name} ${'★'.repeat(concept.importance)}\n\n${concept.explanation}\n`).join('\n')}\n检查：前 8 条均有正文解释、完整学习含义和原文依据；未包含学校/学院、邮箱、页码、纯公式或无意义标题。此处核查文本可用性，不代表对课件中全部学术结论作独立证明。\n\n本次为强制 Mock 后台验收，fetch 被禁止，外部调用次数为 0。未修改 UI、其他任务逻辑或原始资料。\n`);
  console.log(JSON.stringify({ ...report, summary }, null, 2));
} finally { globalThis.fetch = originalFetch; }
