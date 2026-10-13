import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.mjs';
import { demoText } from '../backend/data/demo.mjs';
import { mockOutput } from '../backend/mock.mjs';
import { chunkText } from '../backend/retrieval.mjs';
import { pdfBuffer } from '../tests/helpers.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const shots=resolve(root,'screenshots'),artifacts=resolve(root,'artifacts'),fixtures=resolve(root,'demo-materials');
await Promise.all([mkdir(shots,{recursive:true}),mkdir(artifacts,{recursive:true}),mkdir(fixtures,{recursive:true})]);
await writeFile(resolve(fixtures,'人工智能基础.md'),demoText,'utf8');
await writeFile(resolve(fixtures,'人工智能基础.txt'),demoText.replace(/^#+\s*/gm,''),'utf8');
await writeFile(resolve(fixtures,'AI-基础示例.pdf'),await pdfBuffer('Artificial Intelligence Basics\n\nArtificial intelligence helps computers recognize images, understand language, and make decisions.\n\nMachine learning discovers patterns from training data. Good data improves predictions.\n\nSupervised learning uses labeled examples. Classification predicts categories; regression predicts numbers.\n\nUnsupervised learning discovers patterns without labels. Clustering groups similar examples.\n\nTraining sets teach parameters. Test sets evaluate unseen examples and must not be used in training.\n\nOverfitting means a model performs well on training data but poorly on new examples.\n\nAccuracy is correct predictions divided by all predictions. 85 correct predictions out of 100 equals 85 percent accuracy.\n\nDeep learning uses multiple layers of neural networks.\n\nLanguage models predict text from context. Prompts describe the task, context, and output format.\n\nContext augmentation supplies relevant source material. Models can hallucinate, so important facts must be checked.'));
const executable=process.env.BROWSER_EXECUTABLE || [process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe'),process.env.ProgramFiles && join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe')].filter(Boolean).find(existsSync);
const server=createApp({mode:'mock'}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
let browser;
const results=[];
try {
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1,locale:'zh-CN'});
  const page=await context.newPage();
  let expectedHttpError=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!expectedHttpError)errors.push(m.text());});
  const shot=async(name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(shots,name),fullPage:true});};
  const waitReady=async()=>{await page.getByRole('status').waitFor({state:'hidden'});};
  await page.goto(url);await page.getByText('Mock 演示模式',{exact:true}).first().waitFor();
  await shot('01-首页.png');results.push('首页与模式标记');
  await page.locator('input[type=file]').setInputFiles(resolve(fixtures,'人工智能基础.md'));
  await page.getByTestId('selected-file').waitFor();await shot('02-上传课程资料.png');
  await page.getByRole('button',{name:'开始学习',exact:true}).click();await page.getByText('文本解析完成',{exact:true}).waitFor();results.push('Markdown 上传与解析状态');
  await page.getByRole('button',{name:'提炼重点',exact:true}).last().click();await page.getByText('核心知识点',{exact:true}).waitFor();await waitReady();await shot('03-AI重点提炼.png');results.push('重点提炼');
  await page.getByRole('button',{name:'生成复习提纲',exact:true}).click();await page.locator('.outline-section').first().waitFor();await waitReady();await shot('04-复习提纲.png');results.push('提纲与学习类型');
  await page.getByRole('button',{name:'AI 问答',exact:true}).click();await page.getByLabel('你的问题').fill('什么是过拟合？');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.locator('.ai-answer').waitFor();await waitReady();await shot('05-AI问答.png');assert.ok(await page.locator('.citations').isVisible());results.push('知识问答与可展开原文引用');
  await page.getByRole('button',{name:'生成测试',exact:true}).click();await page.locator('.question-card').first().waitFor();await waitReady();assert.equal(await page.locator('.question-card').count(),5);await shot('06-自动生成测试.png');
  const expected=mockOutput('quiz',{text:demoText,chunks:chunkText(demoText)},chunkText(demoText),{count:5}).questions;
  for(let i=0;i<expected.length;i++) {
    const answer=i===0?(expected[i].answer==='A'?'B':'A'):expected[i].answer;
    await page.locator('.question-card').nth(i).locator('.option').nth('ABCD'.indexOf(answer)).click();
  }
  assert.ok(await page.getByRole('button',{name:'提交答案',exact:true}).isEnabled());await shot('07-答题页面.png');
  await page.getByRole('button',{name:'提交答案',exact:true}).click();await page.locator('.score-circle strong').waitFor();await waitReady();assert.equal(await page.locator('.score-circle strong').innerText(),'80');await shot('08-测试结果.png');results.push('5 题作答、80 分评分、逐题解析');
  await page.getByRole('button',{name:'AI 复习建议',exact:true}).click();await page.locator('.review-content').waitFor();await shot('09-AI复习建议.png');assert.equal(await page.locator('.weaknesses>span').count(),1);results.push('错题复习建议');
  await page.getByRole('button',{name:'10 题',exact:true}).click();await page.getByRole('button',{name:'生成测试',exact:true}).click();await waitReady();assert.equal(await page.locator('.question-card').count(),10);results.push('10 题生成');
  await page.reload();await page.getByRole('button',{name:'继续学习',exact:true}).waitFor();await page.getByRole('button',{name:'继续学习',exact:true}).click();await page.getByText('核心知识点',{exact:true}).waitFor();results.push('刷新后恢复最近资料与学习笔记');
  // 同一浏览器会话检查 TXT、PDF 和错误文件，全部使用后台无界面浏览器。
  for(const name of ['人工智能基础.txt','AI-基础示例.pdf']) {
    await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.locator('input[type=file]').setInputFiles(resolve(fixtures,name));await page.getByRole('button',{name:'开始学习',exact:true}).click();await page.getByText('文本解析完成',{exact:true}).waitFor();results.push(`${name} 浏览器上传解析`);
  }
  expectedHttpError=true;await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.locator('input[type=file]').setInputFiles({name:'损坏.pdf',mimeType:'application/pdf',buffer:Buffer.from('not-pdf')});await page.getByRole('button',{name:'开始学习',exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/损坏|格式/);results.push('损坏 PDF 错误提示');
  await page.getByRole('button',{name:'关闭错误'}).click();await page.getByRole('button',{name:'体验示例课程',exact:true}).click();await page.getByText('文本解析完成',{exact:true}).waitFor();results.push('示例课程');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'返回首页',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(artifacts,'mobile-home.png'),fullPage:true});
  await page.getByRole('button',{name:'体验示例课程',exact:true}).click();await page.locator('.source-card').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(artifacts,'mobile-workspace.png'),fullPage:true});results.push('390 px 移动布局无横向溢出');
  assert.deepEqual(errors,[]);results.push('无浏览器运行时错误');
  await page.setViewportSize({width:1440,height:1000});
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;background:#f7f9f3;color:#32492c;font-family:'Segoe UI','Microsoft YaHei',sans-serif;padding:70px 85px}small{letter-spacing:3px;color:#9aaa88}h1{font-size:38px;font-weight:600;margin:15px 0 10px}p{color:#95a583;font-size:15px}.flow{display:flex;gap:16px;align-items:center;margin:50px 0 40px}.box{background:white;border:1px solid #dbe5d0;border-radius:13px;padding:25px 23px;flex:1;height:150px}.box b{display:block;color:#90a375;font-size:11px;letter-spacing:2px;margin-bottom:18px}.box h2{font-size:19px;margin:0 0 11px}.box p{font-size:12px;line-height:1.8;margin:0}.arrow{color:#b4c3a2}.lower{display:grid;grid-template-columns:1fr 1fr;gap:24px}.panel{border:1px solid #dbe5d0;border-radius:13px;padding:28px;background:#edf3e3}h3{font-size:16px;font-weight:600;margin:0 0 20px}.row{display:flex;justify-content:space-between;font-size:13px;line-height:2.7;border-bottom:1px solid #dce6d0}.row span{color:#8a9f73}.note{padding:24px 0;font-size:12px;color:#9aab87}footer{border-top:1px solid #dbe5d0;margin-top:30px;padding-top:20px;color:#a4b294;font-size:11px;letter-spacing:2px}</style><small>STUDYFORGE AI / SYSTEM OVERVIEW</small><h1>从课程资料，到学习反馈。</h1><p>一个可解释的 AI 学习闭环 · React + Express + 本地规则处理</p><div class="flow"><div class="box"><b>01 / INPUT</b><h2>上传与解析</h2><p>PDF / TXT / Markdown<br>文本检查、按段切分</p></div><div class="arrow">→</div><div class="box"><b>02 / CONTEXT</b><h2>资料增强</h2><p>中文双字词检索<br>相关片段 + 来源编号</p></div><div class="arrow">→</div><div class="box"><b>03 / GENERATE</b><h2>Mock Provider</h2><p>本地规则 + Schema<br>不调用在线 AI 服务</p></div><div class="arrow">→</div><div class="box"><b>04 / VALIDATE</b><h2>校验与评分</h2><p>Zod 校验结构与语义<br>后端保管答案并评分</p></div><div class="arrow">→</div><div class="box"><b>05 / FEEDBACK</b><h2>学习反馈</h2><p>重点 → 提纲 → 测验<br>错题解析 → 复习建议</p></div></div><div class="lower"><div class="panel"><h3>清晰的项目结构</h3><div class="row">frontend/<span>React · TypeScript · Vite</span></div><div class="row">backend/prompts/<span>5 个任务提示词 + 系统提示词</span></div><div class="row">tests/ & scripts/<span>API 测试 · Headless 浏览器</span></div><div class="row">docs/submission/<span>课程材料 · 脚本 · 答辩稿</span></div></div><div class="panel"><h3>课程中展示的 AI 技术</h3><div class="row">任务约束<span>System + Instruction + Context + Schema</span></div><div class="row">简化版 RAG<span>切分 → 检索 → 增强上下文</span></div><div class="row">结构化输出<span>JSON + 类型校验 + 题目语义检查</span></div><div class="row">可复现的演示<span>本地示例课程 + 明确模式标记</span></div></div></div><div class="note">资料与测验暂存在服务内存，最近资料与笔记保存在浏览器；演示无需 API Key；上传资料不发送到 AI 服务。</div><footer>STUDY SMALL. UNDERSTAND MORE.　　/　　V1.0</footer></html>`);
  await shot('10-系统架构或项目结构.png');
  await writeFile(resolve(artifacts,'e2e-results.json'),JSON.stringify({passed:true,browser:executable?.toLowerCase().includes('msedge')?'Microsoft Edge (headless)':'Chromium (headless)',headless:true,checks:results,screenshots:10,realModelTested:false},null,2));
  console.log(`E2E 全部通过：${results.length} 项检查、10 张提交截图。`);
}catch(error){await writeFile(resolve(artifacts,'e2e-results.json'),JSON.stringify({passed:false,checks:results,error:error.message},null,2));throw error;}
finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
