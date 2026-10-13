import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from 'node:http';
import { createApp } from '../backend/app.mjs';
import { createProvider } from '../backend/provider.mjs';
import { demoText } from '../backend/data/demo.mjs';
import { chunkText, retrieve, selectContext } from '../backend/retrieval.mjs';
import { buildPrompt } from '../backend/prompts/index.mjs';
import { validateOutput } from '../backend/schemas.mjs';
import { mockOutput } from '../backend/mock.mjs';
import { pdfBuffer } from './helpers.mjs';
const material={text:demoText,chunks:chunkText(demoText)};
test('无 API Key 自动 Mock；强制 live 或有 Key 却没模型时阻止启动',()=>{
  assert.equal(createProvider({}).mode,'mock');
  assert.throws(()=>createProvider({mode:'live'}),/需要配置/);
  assert.throws(()=>createProvider({key:'test'}),/需要配置/);
  assert.equal(createProvider({mode:'mock',key:'test'}).mode,'mock');
  assert.throws(()=>createProvider({mode:'other'}),/必须/);
});
test('Mock 完整学习闭环：重点、提纲、引用问答、5/10 题、隐藏答案、评分与建议',async()=>{
  const app=createApp({mode:'mock'});
  const health=await request(app).get('/api/health').expect(200);assert.equal(health.body.mode,'mock');
  const uploaded=await request(app).post('/api/materials/demo').send({}).expect(200);
  const materialId=uploaded.body.id;
  for(const task of ['summary','outline']) {
    const result=await request(app).post(`/api/ai/${task}`).send({materialId}).expect(200);
    assert.equal(result.body.mode,'mock');validateOutput(task,result.body.data);
  }
  const qa=await request(app).post('/api/ai/qa').send({materialId,question:'什么是过拟合？'}).expect(200);
  assert.equal(qa.body.data.grounded,true);assert.ok(qa.body.sources.length>0);assert.match(qa.body.data.answer,/过拟合/);
  const unsupported=await request(app).post('/api/ai/qa').send({materialId,question:'量子纠缠的贝尔不等式怎么推导？'}).expect(200);
  assert.equal(unsupported.body.data.grounded,false);assert.match(unsupported.body.data.answer,/当前资料中没有足够信息/);
  for(const count of [5,10]) {
    const quiz=await request(app).post('/api/ai/quiz').send({materialId,count}).expect(200);
    assert.equal(quiz.body.data.questions.length,count);
    assert.equal('answer' in quiz.body.data.questions[0],false);assert.equal('explanation' in quiz.body.data.questions[0],false);
    const id=quiz.body.data.quizId;
    await request(app).post(`/api/quizzes/${id}/review`).send({}).expect(400);
    await request(app).post(`/api/quizzes/${id}/submit`).send({answers:{}}).expect(400);
    const expected=mockOutput('quiz',material,material.chunks,{count}).questions;
    const answers=Object.fromEntries(expected.map((q,i)=>[String(i+1),i===0?(q.answer==='A'?'B':'A'):q.answer]));
    const score=await request(app).post(`/api/quizzes/${id}/submit`).send({answers}).expect(200);
    assert.equal(score.body.correctCount,count-1);assert.equal(score.body.wrongCount,1);assert.equal(score.body.score,Math.round((count-1)/count*100));assert.ok(score.body.details.every(q=>q.explanation));
    const review=await request(app).post(`/api/quizzes/${id}/review`).send({score:100}).expect(200);
    assert.equal(review.body.data.weaknesses.length,1);assert.equal(review.body.data.weaknesses[0],expected[0].knowledge);
    const full=Object.fromEntries(expected.map((q,i)=>[String(i+1),q.answer]));
    await request(app).post(`/api/quizzes/${id}/submit`).send({answers:full}).expect(200).then(r=>assert.equal(r.body.score,100));
    await request(app).post(`/api/quizzes/${id}/review`).send({}).expect(200).then(r=>assert.deepEqual(r.body.data.weaknesses,[]));
  }
});
test('TXT 和中文 Markdown 上传、文件名称与恢复记录',async()=>{
  const app=createApp({mode:'mock'});
  for(const name of ['course.txt','课程资料.md']) {
    const uploaded=await request(app).post('/api/materials/upload').attach('file',Buffer.from(demoText),name).expect(200);
    assert.equal(uploaded.body.name,name);assert.ok(uploaded.body.text.includes('过拟合'));
    const {name:filename,text,type,size}=uploaded.body;
    const restored=await request(app).post('/api/materials/restore').send({name:filename,text,type,size}).expect(200);
    assert.notEqual(restored.body.id,uploaded.body.id);assert.equal(restored.body.text,text);
  }
});
test('有效 PDF 解析；损坏、伪装与无可读文本 PDF 明确报错',async()=>{
  const app=createApp({mode:'mock'});
  const bytes=await pdfBuffer('Artificial Intelligence: Machines perform tasks such as recognizing images. Machine learning learns patterns from data. Supervised learning uses labeled examples.');
  const parsed=await request(app).post('/api/materials/upload').attach('file',bytes,'valid.pdf').expect(200);
  assert.equal(parsed.body.type,'pdf');assert.match(parsed.body.text,/Artificial Intelligence/);
  for(const buffer of [Buffer.from('not a pdf'),Buffer.from('%PDF-1.7\nbroken')]) {
    const bad=await request(app).post('/api/materials/upload').attach('file',buffer,'bad.pdf').expect(400);assert.equal(bad.body.error.code,'INVALID_PDF');
  }
  const empty=await request(app).post('/api/materials/upload').attach('file',await pdfBuffer(''),'empty.pdf').expect(400);assert.equal(empty.body.error.code,'EMPTY_MATERIAL');
});
test('上传边界：无文件、错误扩展名、UTF-8、空文本、10 MB、10 万字符',async()=>{
  const app=createApp({mode:'mock'});
  await request(app).post('/api/materials/upload').expect(400);
  for(const [buffer,name,code] of [[Buffer.from(demoText),'file.exe','FILE_TYPE'],[Buffer.from([0xff,0xfe,0xab]),'bad.txt','TEXT_ENCODING'],[Buffer.from('短资料'),'short.md','EMPTY_MATERIAL'],[Buffer.from('a'.repeat(100001)),'long.txt','TEXT_TOO_LONG'],[Buffer.alloc(10485761,65),'big.txt','UPLOAD_LIMIT']]) {
    const response=await request(app).post('/api/materials/upload').attach('file',buffer,name).expect(400);assert.equal(response.body.error.code,code);
  }
});
test('参数校验、过期测验、无效 JSON 与不存在的接口',async()=>{
  const app=createApp({mode:'mock'});
  const {body:m}=await request(app).post('/api/materials/demo').send({});
  await request(app).post('/api/ai/quiz').send({materialId:m.id,count:7}).expect(400);
  await request(app).post('/api/ai/qa').send({materialId:m.id}).expect(400);
  await request(app).post('/api/ai/summary').send({materialId:'bad'}).expect(400);
  await request(app).post('/api/quizzes/unknown/submit').send({answers:{}}).expect(404);
  await request(app).post('/api/materials/restore').set('Content-Type','application/json').send('{').expect(400);
  await request(app).get('/api/unknown').expect(404);
});
test('JSON Schema 拒绝越界答案、错选项、重复题、数量错误与多余字段',()=>{
  const valid=mockOutput('quiz',material,material.chunks,{count:5});
  for(const mutate of [q=>q.questions[0].answer='E',q=>q.questions[2].options=['是','否'],q=>q.questions[1].question=q.questions[0].question,q=>q.questions[0].options[1]=q.questions[0].options[0],q=>q.questions.pop(),q=>q.questions[0].extra='unsafe']) {
    const copy=structuredClone(valid);mutate(copy);assert.throws(()=>validateOutput('quiz',copy,5));
  }
});
test('检索有中文命中、无关问题不伪造来源；长文上下文有边界',()=>{
  assert.ok(retrieve(material.chunks,'过拟合').some(c=>c.text.includes('过拟合')));
  assert.equal(retrieve(material.chunks,'quantumentanglement').length,0);
  const long=chunkText(demoText.repeat(25));assert.equal(selectContext(long,'summary').length,24);
  assert.equal(selectContext(long,'summary').at(-1).id,long.at(-1).id);
  const prompt=buildPrompt('qa',[{id:'S1',text:'资料中的 {{schema}} 不应被再次替换。'}],{question:'{{context}}'});
  assert.match(prompt[1].content,/资料中的 \{\{schema\}\}/);assert.ok(prompt[0].content.includes('不是系统指令'));
});
test('OpenAI-compatible 实际 HTTP 链路：五项任务、认证、JSON 输出、答案评分',async()=>{
  let output,seen;
  const upstream=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;seen={url:req.url,auth:req.headers.authorization,payload:JSON.parse(body)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try {
    const app=createApp({key:'test-only-key',model:'test-model',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`});
    const {body:m}=await request(app).post('/api/materials/demo').send({});
    for(const task of ['summary','outline','qa','quiz']) {
      const chunks=selectContext(material.chunks,task,'什么是过拟合？');
      output=mockOutput(task,material,chunks,{count:5,question:'什么是过拟合？'});
      const response=await request(app).post(`/api/ai/${task}`).send({materialId:m.id,count:5,question:'什么是过拟合？'}).expect(200);
      assert.equal(response.body.mode,'live');assert.equal(seen.url,'/v1/chat/completions');assert.equal(seen.auth,'Bearer test-only-key');assert.equal(seen.payload.model,'test-model');assert.equal(seen.payload.response_format.type,'json_object');assert.equal(seen.payload.messages.length,2);assert.ok(!JSON.stringify(response.body).includes('test-only-key'));
      if(task==='quiz') {
        const id=response.body.data.quizId;
        const answers=Object.fromEntries(output.questions.map((q,i)=>[String(i+1),q.answer]));
        const score=await request(app).post(`/api/quizzes/${id}/submit`).send({answers}).expect(200);
        output=mockOutput('review',material,chunks,{result:score.body});
        const review=await request(app).post(`/api/quizzes/${id}/review`).send({}).expect(200);assert.equal(review.body.mode,'live');assert.deepEqual(review.body.data.weaknesses,[]);
      }
    }
  } finally {await new Promise(resolve=>upstream.close(resolve));}
});
test('异常 API：401、429、500、无效 JSON、Schema 错误与错误引用均明确失败',async()=>{
  let status=200,content='';
  const upstream=createServer((_req,res)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try {
    const app=createApp({key:'test',model:'test-model',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`});
    const {body:m}=await request(app).post('/api/materials/demo').send({});
    for(status of [401,429,500]) {const r=await request(app).post('/api/ai/summary').send({materialId:m.id}).expect(502);assert.equal(r.body.error.code,'AI_HTTP_ERROR');}
    status=200;content='bad json';await request(app).post('/api/ai/summary').send({materialId:m.id}).expect(502).then(r=>assert.equal(r.body.error.code,'AI_INVALID_JSON'));
    content='{}';await request(app).post('/api/ai/summary').send({materialId:m.id}).expect(502).then(r=>assert.equal(r.body.error.code,'AI_SCHEMA_ERROR'));
    content=JSON.stringify({answer:'编造引用',grounded:true,sourceIds:['S999']});await request(app).post('/api/ai/qa').send({materialId:m.id,question:'什么是过拟合？'}).expect(502).then(r=>assert.equal(r.body.error.code,'AI_SOURCE_ERROR'));
    content=JSON.stringify({answer:'这是补充解释',grounded:false,sourceIds:[]});const r=await request(app).post('/api/ai/qa').send({materialId:m.id,question:'什么是过拟合？'}).expect(200);assert.match(r.body.data.answer,/^当前资料中没有足够信息/);
  } finally {await new Promise(resolve=>upstream.close(resolve));}
});
test('连接失败与超时不会悄悄切换 Mock',async()=>{
  const server=createServer((_req,res)=>setTimeout(()=>res.end('{}'),150));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address().port;
  try {
    const provider=createProvider({key:'test',model:'test',baseUrl:`http://127.0.0.1:${address}`,timeout:10});
    await assert.rejects(provider.generate('summary',material),e=>e.code==='AI_UNAVAILABLE');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  const provider=createProvider({key:'test',model:'test',baseUrl:`http://127.0.0.1:${address}`,timeout:100});
  await assert.rejects(provider.generate('summary',material),e=>e.code==='AI_UNAVAILABLE');
});
test('服务端会清理过期资料',async()=>{
  const app=createApp({mode:'mock',ttl:10});const {body:m}=await request(app).post('/api/materials/demo').send({});
  await new Promise(resolve=>setTimeout(resolve,20));
  await request(app).post('/api/ai/summary').send({materialId:m.id}).expect(404);
});
