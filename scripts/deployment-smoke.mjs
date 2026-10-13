import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { demoText } from '../backend/data/demo.mjs';
import { mockOutput } from '../backend/mock.mjs';
import { chunkText } from '../backend/retrieval.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const remoteIndex=process.argv.indexOf('--url');
const remote=remoteIndex>=0;
const port=Number(process.env.SMOKE_PORT)||10000;
const base=remote?new URL(process.argv[remoteIndex+1]).origin:`http://127.0.0.1:${port}`;
const checks=[];
let child,stdout='',stderr='',ended=false;
const run=promisify(execFile);
async function get(path){const res=await fetch(`${base}${path}`,{signal:AbortSignal.timeout(remote?90000:10000)});assert.equal(res.status,200,path);return res;}
async function post(path,body){const res=await fetch(`${base}${path}`,{method:'POST',headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(remote?90000:10000)});assert.equal(res.status,200,`${path}: ${res.status}`);return res.json();}
try {
  if(!remote){
    const npmCli=process.env.npm_execpath||resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    child=spawn(process.execPath,[npmCli,'start'],{cwd:root,env:{...process.env,NODE_ENV:'production',AI_MODE:'mock',HOST:'0.0.0.0',PORT:String(port)},stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('exit',()=>ended=true);
    const deadline=Date.now()+15000;
    while(!stdout.includes('已启动')){if(ended||Date.now()>deadline)throw new Error(`生产启动失败：${stderr}`);await delay(100);}
    assert.ok(stdout.includes(`http://0.0.0.0:${port}`));checks.push(`npm start 生产环境监听 0.0.0.0:${port}`);
  }
  const home=await get('/');const html=await home.text();assert.match(html,/StudyForge AI/);checks.push('首页 HTTP 200');
  const resources=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]);assert.ok(resources.length>=2);
  for(const resource of resources){const response=await get(resource);assert.match(response.headers.get('content-type'),resource.endsWith('.css')?/text\/css/:/javascript/);assert.ok((await response.arrayBuffer()).byteLength);}
  checks.push('JS/CSS 静态资源及 MIME 正常');
  const refresh=await get('/study/session');assert.match(await refresh.text(),/StudyForge AI/);checks.push('页面路径刷新不返回 404');
  const health=await get('/api/health').then(r=>r.json());assert.equal(health.ok,true);assert.equal(health.mode,'mock');checks.push('公开健康检查及强制 Mock');
  const material=await post('/api/materials/demo',{});assert.ok(material.text.includes('机器学习'));checks.push('自制示例课程');
  for(const task of ['summary','outline']){const generated=await post(`/api/ai/${task}`,{materialId:material.id});assert.equal(generated.mode,'mock');assert.ok(task==='summary'?generated.data.concepts.length:generated.data.sections.length);checks.push(`Mock ${task}`);}
  const qa=await post('/api/ai/qa',{materialId:material.id,question:'什么是过拟合？'});assert.equal(qa.mode,'mock');assert.ok(qa.sources.length);checks.push('Mock 问答与引用');
  for(const count of [5,10]){
    const quiz=await post('/api/ai/quiz',{materialId:material.id,count});assert.equal(quiz.data.questions.length,count);assert.ok(!('answer' in quiz.data.questions[0]));
    const expected=mockOutput('quiz',{text:demoText,chunks:chunkText(demoText)},chunkText(demoText),{count}).questions;
    const answers=Object.fromEntries(expected.map((q,i)=>[String(i+1),i===0?(q.answer==='A'?'B':'A'):q.answer]));
    const result=await post(`/api/quizzes/${quiz.data.quizId}/submit`,{answers});assert.equal(result.correctCount,count-1);assert.equal(result.wrongCount,1);assert.equal(result.score,Math.round((count-1)/count*100));
    const review=await post(`/api/quizzes/${quiz.data.quizId}/review`,{});assert.equal(review.mode,'mock');assert.ok(review.data.weaknesses.length);checks.push(`${count} 题生成、作答、评分、错题建议`);
  }
  for(const filename of ['人工智能基础.md','人工智能基础.txt','AI-基础示例.pdf']){
    const form=new FormData();form.append('file',new Blob([await readFile(resolve(root,'demo-materials',filename))]),filename);
    const parsed=await post('/api/materials/upload',form);assert.ok(parsed.text.length>30);checks.push(`自制 ${filename.split('.').pop().toUpperCase()} 上传解析`);
  }
  if(!remote){await delay(3000);assert.equal(ended,false);await get('/api/health');checks.push('生产进程持续存活');}
  await writeFile(new URL(`../artifacts/${remote?'cloud':'deployment'}-results.json`,import.meta.url),JSON.stringify({passed:true,platform:remote?'remote-public':'Windows production simulation',url:base,mode:'mock',checks,remoteModelCalls:0,remoteHttpVerified:remote},null,2));
  console.log(`${remote?'公网':'本地生产模拟'}验收通过：${checks.length} 项。`);
}catch(error){await writeFile(new URL(`../artifacts/${remote?'cloud':'deployment'}-results.json`,import.meta.url),JSON.stringify({passed:false,checks,error:error.message},null,2));throw error;}
finally{if(child&&!ended){if(process.platform==='win32')await run('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});else child.kill('SIGTERM');}}
