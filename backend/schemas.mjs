import { z } from 'zod';
const text = z.string().trim().min(1).max(2500);
const list = z.array(text).min(1).max(12);
export const schemas = {
  summary: z.object({ overview: text, concepts: z.array(z.object({ name: text, explanation: text, importance: z.number().int().min(1).max(3) }).strict()).min(5).max(10), mustKnow: list, skim: list }).strict(),
  outline: z.object({ sections: z.array(z.object({ title: text, items: z.array(z.object({ title: text, type: z.enum(['理解','记忆','计算','易错']), detail: text }).strict()).min(1).max(10) }).strict()).min(1).max(8) }).strict(),
  qa: z.object({ answer: text, grounded: z.boolean(), sourceIds: z.array(z.string().max(30)).max(6) }).strict(),
  quiz: z.object({ questions: z.array(z.object({ type: z.enum(['single','boolean']), question: text, options: z.array(text).min(2).max(4), answer: z.enum(['A','B','C','D']), explanation: text, knowledge: text }).strict()).min(5).max(10) }).strict(),
  review: z.object({ overview: text, weaknesses: z.array(text).max(10), steps: z.array(z.object({ title: text, action: text }).strict()).min(1).max(6) }).strict()
};
export const outputSchemas = Object.fromEntries(Object.entries(schemas).map(([key,value]) => [key,z.toJSONSchema(value)]));
const mockSummarySchema = schemas.summary.extend({ concepts: z.array(schemas.summary.shape.concepts.element).min(1).max(10) });
export function validateOutput(task, value, count, options = {}) {
  const schema = task === 'summary' && options.mode === 'mock' ? mockSummarySchema : schemas[task];
  const result = schema.parse(value);
  if (task === 'quiz') {
    if (result.questions.length !== count) throw new Error('题目数量不符合要求');
    const seen = new Set();
    for (const q of result.questions) {
      if (q.options.length !== (q.type === 'single' ? 4 : 2)) throw new Error('选项数量错误');
      if ('ABCD'.indexOf(q.answer) >= q.options.length) throw new Error('答案超出选项范围');
      if (q.type === 'boolean' && (q.options[0] !== '正确' || q.options[1] !== '错误')) throw new Error('判断题选项错误');
      if (seen.has(q.question)) throw new Error('存在重复题目');
      if (new Set(q.options).size !== q.options.length) throw new Error('存在重复选项');
      seen.add(q.question);
    }
  }
  return result;
}
