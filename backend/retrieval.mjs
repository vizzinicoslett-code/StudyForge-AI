export function chunkText(text, size = 900, overlap = 120) {
  const chunks = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    chunks.push({ id: `S${chunks.length + 1}`, text: text.slice(start, start + size), start });
    if (start + size >= text.length) break;
  }
  return chunks;
}
export function terms(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9]{2,}/g) || [];
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) || []) {
    for (let i=0;i<run.length-1;i++) words.push(run.slice(i,i+2));
  }
  return [...new Set(words)];
}
export function retrieve(chunks, question, limit = 4) {
  const query = terms(question);
  const scores = chunks.map(chunk => {
    const tokens = new Set(terms(chunk.text));
    const matches = query.filter(t=>tokens.has(t));
    const score = (matches.length >= Math.min(2, query.length) && matches.length / query.length >= 0.12) ? matches.reduce((sum,t) => sum + Math.log(1 + chunks.length / chunks.filter(c=>c.text.toLowerCase().includes(t)).length), 0) : 0;
    return { ...chunk, score };
  });
  return scores.filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function selectContext(chunks, task, query = '') {
  if (task === 'qa') return retrieve(chunks, query);
  if (task === 'review' && query) {
    const selected = retrieve(chunks,query,12);
    if (selected.length) return selected;
  }
  // 短资料全部使用；长资料均匀覆盖各部分，界面提示这是抽样上下文。
  if (chunks.length <= 24) return chunks;
  return Array.from({length:24},(_,i)=>chunks[Math.round(i*(chunks.length-1)/23)]);
}
