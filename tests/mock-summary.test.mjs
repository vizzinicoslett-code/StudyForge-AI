import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSummaryText, extractMockSummary } from '../backend/mock-summary.mjs';
import { validateOutput } from '../backend/schemas.mjs';
import { createProvider } from '../backend/provider.mjs';
import { chunkText } from '../backend/retrieval.mjs';

// PDF 风格的断行、页眉、图轴与公式噪声；正文均为明确的课程知识。
const lecturePdfText = `固体物理：晶格振动
示例讲师
示例大学 示例学院
邮箱：teacher@example.invalid
https://example.invalid/course
2026.10.12
-- 1 of 27 --
目录
3.1 双原子链
在双原
子链中，每个波矢 q 对应两个振动频率，分别形成声学支和光学支两条色散支。
色散关系表示振动频率随波矢的变化，是描述晶格振动传播特征的基本关系。
ω+(q) ≡ ωO(q)
ω−(q) ≡ ωA(q)
q
ω
0
π
固体物理 第3章 2026.10.12
-- 2 of 27 --
示例大学 示例学院
3.2 声学支
声学支是指在长波极限下频率趋于零的振动分支，其原胞内两个原子近似同向运动。
在声学支的长波极限下，原胞质心参与振动，晶格中的位移可以形成类似声波的传播。
固体物理 第3章 2026.10.12
Page 3
3.3 光学支
光学支是指在长波极限下具有有限振动频率的分支，原胞内两个原子主要作相对运动。
ω+(q) ≡ ωO(q) 光学波
与光学色散有交点，可被光激发/耦合
在光学支的长波极限下，原胞质心近似不动，两个原子的相对位移决定其主要振动特征。
固体物理 第3章 2026.10.12
第 4 页 / 共 27 页
示例大学 示例学院
3.4 周期性边界条件
周期性边界条件要求相隔整个晶体长度的原子具有相同位移，因此允许的波矢取离散值。
第一布里渊区表示波矢的独立取值区域，在周期性边界条件下共有 N 个独立波矢。
固体物理 第3章 2026.10.12
5 of 27
3.5 振动模式与频率禁带
每个波矢对应一个声学模式和一个光学模式，因此含 N 个原胞的双原子链共有 2N 个振动模式。
频率禁带是指两条允许频带之间无法形成传播格波的频率范围，可由声学支与光学支的色散关系判断。
色散关系表示振动频率随波矢的变化，是描述晶格振动传播特征的基本关系。
固体物理 第3章 2026.10.12
-- 6 of 27 --
谢谢
END
27
★
`;

const sixFacts = [
  '声学支是指长波极限下频率趋于零的晶格振动分支，原胞内两个原子近似同向运动。',
  '光学支是指长波极限下保持有限频率的晶格振动分支，原胞内两个原子主要作相对运动。',
  '色散关系表示晶格振动频率随波矢的变化，可以用来描述不同振动分支的传播特征。',
  '周期性边界条件要求相隔晶体总长度的原子具有相同位移，因此允许波矢取离散值。',
  '第一布里渊区表示波矢的独立取值范围，在周期性边界条件下包含 N 个独立波矢。',
  '双原子链的振动模式数等于原子自由度数，每个波矢各对应一个声学模式和一个光学模式。',
];

const compact = value => value.normalize('NFKC').replace(/\s+/gu, '');
const chineseCount = value => (value.match(/[\p{Script=Han}]/gu) || []).length;
const summaryText = summary => [
  summary.overview,
  ...summary.concepts.flatMap(concept => [concept.name, concept.explanation]),
  ...summary.mustKnow,
  ...summary.skim,
].join('\n');

function assertUsefulSummary(summary, min = 1, max = 10) {
  assert.ok(summary.concepts.length >= min && summary.concepts.length <= max,
    `应返回 ${min}–${max} 个有效知识点，实际 ${summary.concepts.length} 个`);
  assert.equal(typeof summary.overview, 'string');
  assert.ok(summary.overview.trim());
  assert.ok(Array.isArray(summary.mustKnow));
  assert.ok(Array.isArray(summary.skim));
  const seen = new Set();
  for (const concept of summary.concepts) {
    assert.ok(concept.name.trim());
    assert.ok(concept.name.length <= 45, `标题应为短标题：${concept.name}`);
    assert.ok(chineseCount(concept.explanation) >= 14,
      `纯公式、图轴标签或无上下文的短句不是复习重点：${concept.explanation}`);
    assert.ok(concept.explanation.length >= 15);
    assert.ok([1, 2, 3].includes(concept.importance));
    assert.doesNotMatch(concept.explanation.trim(), /^(?:与光学色散有交点|频率低，处于声频段)/u);
    assert.doesNotMatch(concept.explanation.trim(), /[，、：]$/u,
      `不应在句子未结束时直接截断：${concept.explanation}`);
    const key = compact(concept.explanation).replace(/[。！？；]/gu, '');
    assert.ok(!seen.has(key), `重复知识点：${concept.explanation}`);
    seen.add(key);
  }
  assert.doesNotMatch(summaryText(summary), /资料要点\s*\d|AI\s*已智能理解全文/u);
}

test('PDF 清洗排除联系方式、页码、机构页眉、署名、短标签和重复句', () => {
  const clean = cleanSummaryText(lecturePdfText);
  assert.equal(typeof clean.text, 'string');
  assert.doesNotMatch(clean.text, /@|https?:\/\/|example\.invalid/iu);
  assert.doesNotMatch(clean.text, /\d+\s*of\s*\d+|Page\s*\d+|第\s*\d+\s*页/iu);
  assert.doesNotMatch(clean.text, /示例大学|示例学院|示例讲师|2026\.10\.12/u);
  assert.doesNotMatch(clean.text, /(?:^|\n)\s*(?:目录|谢谢|END|27|★)\s*(?=\n|$)/mu);
  assert.doesNotMatch(clean.text, / {3,}|\n{3,}/u);
  const duplicate = '色散关系表示振动频率随波矢的变化，是描述晶格振动传播特征的基本关系';
  assert.equal(compact(clean.text).split(compact(duplicate)).length - 1, 1);
});

test('PDF 正文断行恢复完整中文，不把单词断成残句', () => {
  const clean = cleanSummaryText(lecturePdfText);
  assert.ok(compact(clean.text).includes(compact('在双原子链中，每个波矢q对应两个振动频率')));
  assert.doesNotMatch(clean.text, /双原\n子链/u);
  const summary = extractMockSummary(lecturePdfText, '固体物理-晶格振动.pdf');
  const doubleChain = summary.concepts.find(concept => /双原子链/u.test(concept.explanation));
  assert.ok(doubleChain, '应保留完整的双原子链正文知识');
});

test('物理课 PDF 生成 6–10 条有正文解释的重点，公式与页眉不成为知识点', () => {
  const summary = extractMockSummary(lecturePdfText, '固体物理-晶格振动.pdf');
  assertUsefulSummary(summary, 6, 10);
  assert.doesNotMatch(summaryText(summary), /@|https?:\/\/|示例大学|示例学院|示例讲师/u);
  assert.doesNotMatch(summaryText(summary), /\d+\s*of\s*\d+|Page\s*\d+|第\s*\d+\s*页/iu);
  assert.match(summary.overview, /双原子链|声学支|光学支|色散关系|晶格振动/u);
  assert.ok(summary.concepts.some(concept => /声学支/u.test(concept.explanation)));
  assert.ok(summary.concepts.some(concept => /光学支/u.test(concept.explanation)));
  assert.ok(summary.concepts.some(concept => /色散关系/u.test(concept.explanation)));
  assert.ok(summary.concepts.some(concept => !/^核心知识点\s*\d+$/u.test(concept.name)),
    '能识别物理概念时应产生有意义的标题');
});

test('同一份资料的重点、标题、顺序、重要程度和概览保持确定性', () => {
  const first = extractMockSummary(lecturePdfText, '固体物理-晶格振动.pdf');
  const second = extractMockSummary(lecturePdfText, '固体物理-晶格振动.pdf');
  assert.deepEqual(second, first);
});

test('只有六条有效知识时保留六条，不为凑十条填入页码或公式', () => {
  const raw = `晶格振动\n示例大学 示例学院\n${sixFacts.join('\n')}\n-- 1 of 27 --\nω+(q) ≡ ωO(q)\n谢谢\nEND`;
  const summary = extractMockSummary(raw, '晶格振动.pdf');
  assertUsefulSummary(summary, 6, 6);
  for (const concept of summary.concepts) {
    const explanation = compact(concept.explanation).replace(/[。！？；]/gu, '');
    assert.ok(sixFacts.some(fact => compact(fact).includes(explanation)),
      `知识正文必须来自这六条资料：${concept.explanation}`);
  }
});

test('不足五条有效资料仍不填充垃圾或编造概念', () => {
  const facts = sixFacts.slice(0, 3);
  const raw = `${facts.join('\n')}\n邮箱：teacher@example.invalid\n-- 1 of 27 --\nEND\nω+(q) ≡ ωO(q)`;
  const summary = extractMockSummary(raw, '节选.txt');
  assertUsefulSummary(summary, 1, 3);
  assert.doesNotMatch(summaryText(summary), /@|资料要点|of\s*27/u);
  for (const concept of summary.concepts) {
    assert.ok(facts.some(fact => compact(fact).includes(compact(concept.explanation).replace(/[。！？；]/gu, ''))),
      `不能填入这段资料之外的正文：${concept.explanation}`);
  }
});

test('页眉过滤不误删含“学校”和“学院”等机构词的真实教学正文', () => {
  const sentence = '学校采用监督学习进行分类时，需要使用带有已知类别标签的训练样本，并通过预测误差调整模型参数。';
  const other = '学院的数据分析实验说明，测试集用于评价模型对未参与训练的数据的泛化能力。';
  const raw = `机器学习课程\n示例大学 示例学院\n${sentence}\n${other}\n示例大学 示例学院\n-- 2 of 27 --`;
  const cleaned = cleanSummaryText(raw);
  assert.ok(compact(cleaned.text).includes(compact(sentence)));
  assert.ok(compact(cleaned.text).includes(compact(other)));
  const summary = extractMockSummary(raw, '机器学习课程.txt');
  assertUsefulSummary(summary, 1, 2);
  assert.ok(summary.concepts.some(concept => /监督学习|泛化能力/u.test(concept.explanation)));
});

test('没有正文候选时明确报错，不把邮箱、公式或页码伪装成重点', () => {
  const raw = '示例大学 示例学院\n示例讲师\nteacher@example.invalid\n-- 1 of 27 --\nω+(q) ≡ ωO(q)\n目录\n谢谢\nEND\n0\nπ';
  assert.throws(() => extractMockSummary(raw, '空正文.pdf'),
    error => error instanceof Error && /正文|知识|有效|重点|内容/u.test(error.message),
    '应说明没有可供提取的有效正文');
});

test('仅 Mock 重点允许少于五条，并通过 Provider 校验；其他模式的规则不变', async () => {
  const raw=sixFacts.slice(0,3).join('\n');
  const summary=extractMockSummary(raw,'节选.txt');
  assert.equal(summary.concepts.length,3);
  assert.deepEqual(validateOutput('summary',summary,undefined,{mode:'mock'}),summary);
  assert.throws(()=>validateOutput('summary',summary),/5/);
  const provider=createProvider({mode:'mock'});
  const result=await provider.generate('summary',{text:raw,name:'节选.txt',chunks:chunkText(raw)});
  assert.equal(result.mode,'mock');
  assert.deepEqual(result.data,summary);
});
