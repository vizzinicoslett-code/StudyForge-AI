import { AppError } from './errors.mjs';
import { terms } from './retrieval.mjs';
import { extractMockSummary } from './mock-summary.mjs';
export function factsFrom(text) {
  const sections = text.split(/\n(?=#{1,6}\s)/).filter(s=>s.trim());
  let facts = sections.filter(s=>!/^#\s/.test(s)).map(s=>{
    const lines=s.trim().split('\n');
    const title=lines[0].replace(/^#+\s*/,'').replace(/^\d+[.、]\s*/,'');
    const body=lines.slice(1).join(' ').trim();
    return {title:title.slice(0,90),body:body.slice(0,1200)};
  }).filter(f=>f.body.length>10);
  if (facts.length<5) {
    facts=text.split(/[\n。！？.!?]+/).map(s=>s.replace(/^#+\s*/, '').trim()).filter(s=>s.length>=12).map((s,i)=>({title:`资料要点 ${i+1}`,body:s.slice(0,1200)}));
  }
  if (!facts.length) facts=[{title:'资料主旨',body:text.slice(0,1200)}];
  return facts.slice(0,30);
}
const first = text => text.split(/[。！？]/)[0] + (text.includes('。') ? '。' : '');
export function mockOutput(task,material,chunks,params) {
  if(task==='summary') return extractMockSummary(material.text,material.name);
  const facts=factsFrom(material.text);
  if(task==='outline') return {sections:Array.from({length:Math.ceil(Math.min(facts.length,10)/3)},(_,group)=>({title:`第${group+1}部分 · ${['建立概念','辨别与评估','应用与反思','综合复习'][group]}`,items:facts.slice(group*3,group*3+3).map((f,i)=>({title:f.title,type:/准确率|计算|公式/.test(f.body)?'计算':/过拟合|不能|幻觉/.test(f.body)?'易错':i===1?'记忆':'理解',detail:`能解释并复述：${first(f.body)}`}))}))};
  if(task==='qa') {
    // Mock 只摘录，不冒充模型推理或补充资料外知识。
    const related=facts.filter(f=>chunks.some(c=>c.text.includes(f.body.slice(0,30))));
    const question=params.question.toLowerCase();
    const ranked=related.map(f=>({...f,score:terms(question).reduce((n,t)=>n+(f.title.toLowerCase().includes(t)?5:0)+(f.body.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
    if(!chunks.length) return {answer:'当前资料中没有足够信息，以下内容为 AI 补充解释。当前处于 Mock 演示模式，无法生成真实的补充解释。请配置模型 API 后再提问，或换一个资料中的知识点。',grounded:false,sourceIds:[]};
    const selected=ranked.slice(0,1);
    const answer=selected.length?selected.map(f=>`${f.title}\n${f.body}`).join('\n\n'):chunks[0].text.slice(0,800);
    const used=chunks.filter(c=>selected.some(f=>c.text.includes(f.body.slice(0,30))));
    return {answer:`资料中可供参考的内容如下：\n\n${answer}\n\nMock 模式展示相关原文摘录；更深入的解释需要真实 AI 模式。`,grounded:true,sourceIds:(used.length?used:chunks).slice(0,2).map(c=>c.id)};
  }
  if(task==='quiz') {
    if(facts.length<3) throw new AppError('INSUFFICIENT_MATERIAL','演示出题需要至少 3 段完整知识内容，请上传更丰富的资料或体验示例课程。');
    return {questions:Array.from({length:params.count},(_,i)=>{
      const f=facts[i%facts.length];
      if(i%3===2 || facts.length<4 || i>=facts.length) {
        const correct=i%2===0;
        const statement=correct?first(f.body):first(facts[(i+1)%facts.length].body);
        return {type:'boolean',question:`根据资料，「${f.title}」部分的说明是：${statement}`,options:['正确','错误'],answer:correct?'A':'B',explanation:`「${f.title}」原文说明：${first(f.body)}`,knowledge:f.title};
      }
      const answerIndex=i%4;
      const alternatives=Array.from({length:3},(_,j)=>first(facts[(i+j+1)%facts.length].body));
      alternatives.splice(answerIndex,0,first(f.body));
      return {type:'single',question:`以下哪一项对应资料中「${f.title}」的说明？`,options:alternatives,answer:'ABCD'[answerIndex],explanation:`资料依据：${first(f.body)}`,knowledge:f.title};
    })};
  }
  const result=params.result;
  const weaknesses=[...new Set(result.details.filter(d=>!d.correct).map(d=>d.knowledge))];
  return {overview:weaknesses.length?`本次答对 ${result.correctCount}/${result.total} 题，得分 ${result.score}。建议回到原文，优先补齐本次错题对应的知识点。`:`本次 ${result.total} 题全部答对。可以进一步用自己的话解释概念，并尝试举例应用。`,weaknesses,steps:weaknesses.length?weaknesses.slice(0,5).map(title=>({title,action:`回看资料中的「${title}」；对照错题解析，写出正确结论，再解释错误选项为什么不符合原文。`})): [{title:'主动复述',action:'合上资料，用自己的话解释三个核心概念，并各举一个例子。'},{title:'间隔复习',action:'明天回看提纲并重新生成一组测试，检查是否仍然理解。'}]};
}
