import { readFileSync } from 'node:fs';
import { outputSchemas } from '../schemas.mjs';
export const systemPrompt = readFileSync(new URL('./systemPrompt.txt', import.meta.url), 'utf8').trim();
export const templates = Object.fromEntries(['summary','outline','qa','quiz','review'].map(task => [task, readFileSync(new URL(`./${task}Prompt.txt`, import.meta.url), 'utf8').trim()]));
export function buildPrompt(task, chunks, params = {}) {
  const variables = {
    context: chunks.map(c => `[${c.id}]\n${c.text}`).join('\n\n') || '没有检索到相关资料片段。',
    schema: JSON.stringify(outputSchemas[task], null, 2),
    question: params.question || '', count: params.count || 5,
    result: JSON.stringify(params.result || {}, null, 2)
  };
  // 一次替换，防止资料中的占位符被再次解释。
  return [{ role:'system',content:systemPrompt },{ role:'user',content:templates[task].replace(/\{\{(\w+)\}\}/g,(_,key)=>variables[key] ?? '') }];
}
