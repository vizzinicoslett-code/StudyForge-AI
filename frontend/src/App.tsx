import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, FileText, GraduationCap, Layers3, Leaf, Lightbulb, ListChecks, LoaderCircle, MessageCircle, Plus, RotateCcw, ShieldCheck, Sparkles, Target, UploadCloud, X } from 'lucide-react';
import type { Chat, Envelope, Material, Mode, Outline, QA, Quiz, Recent, Result, Review, Summary } from './types';
type View='source'|'summary'|'outline'|'qa'|'quiz'|'result';
const STORAGE='studyforge.recent.v1';
const labels:Record<View,string>={source:'课程资料',summary:'重点提炼',outline:'复习提纲',qa:'AI 问答',quiz:'自我测试',result:'学习报告'};
const icons={source:FileText,summary:Sparkles,outline:Layers3,qa:MessageCircle,quiz:ListChecks,result:Target};
async function api<T>(path:string,body?:unknown):Promise<T> {
  let response:Response;
  try {response=await fetch(`/api${path}`,body instanceof FormData?{method:'POST',body}:{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
  catch {throw new Error('无法连接本地服务，请确认服务已启动后重试。');}
  let data;
  try {data=await response.json();} catch {throw new Error('服务返回了无法读取的响应，请检查启动状态。');}
  if(!response.ok) throw new Error(data.error?.message || '操作失败，请稍后重试。');
  return data;
}
function readRecent():Recent|null {try {const value=JSON.parse(localStorage.getItem(STORAGE)||'null');return value?.material?.text && Array.isArray(value.chats)?value:null;}catch{return null;}}
const sizeLabel=(size:number)=>size<1024?`${size} B`:`${(size/1024).toFixed(1)} KB`;
function ModeBadge({mode}:{mode?:Mode}) {return <span className={`mode-badge ${mode==='live'?'live':''}`}><span/>{mode==='live'?'真实 AI 模式':mode==='mock'?'Mock 演示模式':'连接服务中'}</span>;}
export default function App() {
  const [health,setHealth]=useState<{mode:Mode;model:string}>();
  const [material,setMaterial]=useState<Material>();
  const [view,setView]=useState<View>('source');
  const [file,setFile]=useState<File>();
  const [recent,setRecent]=useState<Recent|null>(readRecent);
  const [summary,setSummary]=useState<Envelope<Summary>>();
  const [outline,setOutline]=useState<Envelope<Outline>>();
  const [chats,setChats]=useState<Chat[]>([]);
  const [question,setQuestion]=useState('');
  const [quiz,setQuiz]=useState<Envelope<Quiz>>();
  const [count,setCount]=useState<5|10>(5);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [result,setResult]=useState<Result>();
  const [review,setReview]=useState<Envelope<Review>>();
  const [reportTab,setReportTab]=useState<'answers'|'review'>('answers');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [storageNotice,setStorageNotice]=useState('');
  const [dragging,setDragging]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{api<{mode:Mode;model:string}>('/health').then(setHealth).catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    if(!material)return;
    const record:Recent={material,summary,outline,chats:chats.slice(-10),score:result?.score,updatedAt:new Date().toISOString()};
    try {localStorage.setItem(STORAGE,JSON.stringify(record));setRecent(record);setStorageNotice('');}
    catch {setStorageNotice('浏览器存储空间不足，本次学习记录无法自动保存。');}
  },[material,summary,outline,chats,result]);
  async function run(label:string,fn:()=>Promise<void>) {
    if(busy)return;
    setBusy(label);setError('');
    try {await fn();} catch(e) {setError(e instanceof Error?e.message:'操作失败，请重试。');}
    finally {setBusy('');}
  }
  function chooseFile(selected?:File) {
    if(!selected)return;
    if(!/\.(pdf|txt|md|markdown)$/i.test(selected.name)){setError('请选择 PDF、TXT 或 Markdown 文件。');return;}
    if(selected.size>10*1024*1024){setError('文件不能超过 10 MB，请按章节拆分。');return;}
    setFile(selected);setError('');
  }
  function openMaterial(m:Material) {
    setMaterial(m);setSummary(undefined);setOutline(undefined);setChats([]);setQuiz(undefined);setAnswers({});setResult(undefined);setReview(undefined);setView('source');setFile(undefined);setQuestion('');
  }
  function upload() {run('解析资料',async()=>{if(!file)return;const form=new FormData();form.append('file',file);openMaterial(await api<Material>('/materials/upload',form));});}
  function demo() {run('准备示例课程',async()=>openMaterial(await api<Material>('/materials/demo',{})));}
  function resume() {if(!recent)return;run('恢复学习记录',async()=>{const m=await api<Material>('/materials/restore',{name:recent.material.name,text:recent.material.text,type:recent.material.type,size:recent.material.size});openMaterial(m);setSummary(recent.summary);setOutline(recent.outline);setChats(recent.chats);setView(recent.summary?'summary':'source');});}
  function generate(task:'summary'|'outline'|'quiz') {
    if(!material)return;
    const target=task;
    setView(target);
    run(labels[task],async()=>{
      if(task==='summary')setSummary(await api<Envelope<Summary>>('/ai/summary',{materialId:material.id}));
      if(task==='outline')setOutline(await api<Envelope<Outline>>('/ai/outline',{materialId:material.id}));
      if(task==='quiz') {const generated=await api<Envelope<Quiz>>('/ai/quiz',{materialId:material.id,count});setQuiz(generated);setAnswers({});setResult(undefined);setReview(undefined);setReportTab('answers');}
    });
  }
  function ask(text=question) {
    if(!material||!text.trim())return;
    setView('qa');
    run('回答问题',async()=>{const response=await api<Envelope<QA>>('/ai/qa',{materialId:material.id,question:text.trim()});setChats(c=>[...c,{question:text.trim(),response}]);setQuestion('');});
  }
  function submit() {
    if(!quiz)return;
    run('提交答案',async()=>{
      const scored=await api<Result>(`/quizzes/${quiz.data.quizId}/submit`,{answers});setResult(scored);setView('result');setReportTab('answers');
      // 评分先显示；建议失败时仍保留完整成绩，并可手动重试。
      setBusy('生成复习建议');
      try {setReview(await api<Envelope<Review>>(`/quizzes/${quiz.data.quizId}/review`,{}));}catch(e){setError(e instanceof Error?e.message:'复习建议生成失败，可点击重试。');}
    });
  }
  function regenerateReview() {if(!quiz)return;run('生成复习建议',async()=>setReview(await api<Envelope<Review>>(`/quizzes/${quiz.data.quizId}/review`,{})));}
  const activeMode=view==='summary'&&summary?summary.mode:view==='outline'&&outline?outline.mode:view==='quiz'&&quiz?quiz.mode:view==='result'&&result?result.mode:health?.mode;
  const progress=[!!material,!!summary,!!outline,!!result];
  const sampled=(view==='summary'&&summary?.contextSampled)||(view==='outline'&&outline?.contextSampled)||(view==='quiz'&&quiz?.contextSampled);
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>{setMaterial(undefined);setError('');}} disabled={!!busy} aria-label="返回首页"><span className="brand-mark"><Layers3 size={21}/></span><span>StudyForge <span className="brand-ai">AI</span></span></button><div className="topbar-right"><span className="course-label">你的学习，有迹可循</span><ModeBadge mode={health?.mode}/><span className="avatar"><GraduationCap size={19}/></span></div></header>
    <div className="notification-area" aria-live="polite">{error&&<div className="alert" role="alert"><CircleHelp size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="关闭错误"><X size={16}/></button></div>}{storageNotice&&<div className="alert">{storageNotice}</div>}</div>
    <input ref={input} type="file" hidden accept=".pdf,.txt,.md,.markdown" aria-label="选择课程资料" onChange={e=>chooseFile(e.target.files?.[0])}/>
    {!material?<main className="home">
      <section className="hero"><div className="eyebrow"><span className="tiny-square"/> 为大学生的每一次复习而造</div><h1>把课程资料变成<br/>你的 <span>AI 复习助手</span><span className="hero-dot">.</span></h1><p className="hero-description">从一份资料，到真正掌握。<br/>提炼重点、理清脉络、练习检验，让学习更有方向。</p><div className="hero-flow"><span><BookOpen size={16}/> 读懂资料</span><ChevronRight size={14}/><span><Lightbulb size={16}/> 理清重点</span><ChevronRight size={14}/><span><Target size={16}/> 检验掌握</span></div></section>
      <div className="home-grid"><section className="upload-card"><div className="section-caption"><span className="step-number">01</span> 从你的课程开始 <span className="small-muted">NEW SESSION</span></div><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);chooseFile(e.dataTransfer.files[0]);}}><span className="upload-icon"><UploadCloud size={30} strokeWidth={1.5}/></span><h2>{file?'资料已就绪':'上传一份学习资料'}</h2><p>拖拽文件到这里，或从电脑中选择</p><button className="button secondary" onClick={()=>input.current?.click()} disabled={!!busy}>选择文件 <Plus size={16}/></button><div className="file-formats"><span>PDF</span><span>TXT</span><span>Markdown</span><em>单文件 ≤ 10 MB · UTF-8 文本</em></div></div>{file?<div className="selected-file" data-testid="selected-file"><FileText size={23}/><div><strong>{file.name}</strong><span>{file.name.split('.').pop()?.toUpperCase()} · {sizeLabel(file.size)} · {busy==='解析资料'?'正在解析文本…':'等待解析'}</span></div><button onClick={()=>setFile(undefined)} disabled={!!busy} aria-label="移除文件"><X size={16}/></button></div>:<p className="privacy-note"><ShieldCheck size={15}/> 资料在本机解析；真实 AI 模式会将相关片段发送给模型服务。</p>}<button className="button primary start-button" disabled={!file||!!busy} onClick={upload}>{busy==='解析资料'?<LoaderCircle className="spin" size={18}/>:null}{busy==='解析资料'?'正在解析资料':'开始学习'}<ArrowRight size={18}/></button></section>
      <div className="home-aside"><section className="demo-card"><div className="demo-symbol"><Leaf size={26}/></div><div className="eyebrow">先试试看</div><h2>没有资料？<br/>从一堂示例课开始。</h2><p>人工智能基础 · 10 个知识主题<br/>完整体验从重点到测验的学习流程。</p><button className="text-button" onClick={demo} disabled={!!busy}>体验示例课程 <ArrowUpRight size={18}/></button></section><section className="recent-card"><div className="section-caption"><Clock3 size={16}/> 最近一次学习</div>{recent?<><h3>{recent.material.name}</h3><p>{new Date(recent.updatedAt).toLocaleDateString('zh-CN')} · {recent.material.characters.toLocaleString()} 字{recent.score!==undefined?` · 上次测验 ${recent.score} 分`:''}</p><div className="recent-actions"><button className="text-button" onClick={resume} disabled={!!busy}>继续学习 <ArrowRight size={16}/></button><button className="quiet-button" disabled={!!busy} onClick={()=>{localStorage.removeItem(STORAGE);setRecent(null);}}>清除记录</button></div></>:<><h3>每一次投入，都值得留下。</h3><p>开始学习后，会自动保留最近的资料与笔记。</p></>}</section></div></div>
      <footer className="home-footer"><span>STUDY SMALL. UNDERSTAND MORE.</span><p><CheckCircle2 size={14}/> 一个清晰、完整的学习循环</p><span>StudyForge AI / V1.0</span></footer>
    </main>:<div className="workspace">
      <aside className="sidebar"><button className="new-session" onClick={()=>{setMaterial(undefined);setError('');}} disabled={!!busy}><Plus size={16}/> 新的学习</button><div className="sidebar-label">当前课程</div><div className="material-card"><span className="document-icon"><FileText size={21}/></span><strong title={material.name}>{material.name}</strong><p>{material.type.toUpperCase()} · {sizeLabel(material.size)}</p><span className="parsed"><Check size={12}/> 文本解析完成</span></div><div className="sidebar-label">学习空间</div><nav aria-label="学习导航">{(Object.keys(labels) as View[]).map(key=>{const Icon=icons[key];return <button key={key} className={`nav-item ${view===key?'active':''}`} onClick={()=>setView(key)}><Icon size={18}/>{labels[key]}{(key==='summary'&&summary)||(key==='outline'&&outline)||(key==='result'&&result)?<span className="nav-dot"/>:null}</button>;})}</nav><div className="sidebar-bottom"><span className="sidebar-label">本次学习进度</span><div className="progress-bars">{progress.map((done,i)=><span key={i} className={done?'done':''}/>)}</div><p>{progress.filter(Boolean).length} / 4 步已完成</p><span className="local-note"><ShieldCheck size={14}/> 最近记录保存在此浏览器</span></div></aside>
      <main className="study-main"><div className="breadcrumb">学习空间 <ChevronRight size={13}/> {labels[view]} <span className="autosave"><span/> 自动保存</span></div><div className="content-heading"><div><div className="eyebrow">{view==='source'?'YOUR COURSE MATERIAL':view==='result'?'LEARNING REFLECTION':'LEARN WITH INTENTION'}</div><h1>{view==='source'?'知识，从这里开始。':view==='summary'?'先抓住最重要的。':view==='outline'?'让知识有条理。':view==='qa'?'不懂的，再聊一聊。':view==='quiz'?'理解了，就试一试。':'看见你的学习进步。'}</h1><p>{view==='source'?`已提取 ${material.characters.toLocaleString()} 字 · 可以开始提炼重点了`:view==='summary'?'理解主线，再把精力放在核心知识上。':view==='outline'?'一份清晰的框架，让复习更有方向。':view==='qa'?'优先依据课程资料，回答附带参考片段。':view==='quiz'?'用一次小测验，把“看过”变成“学会”。':'从每一道错题出发，找到下一步的复习方向。'}</p></div><span className="heading-icon">{view==='result'?<Target size={25}/>:<BookOpen size={25}/>}</span></div>
      <ModeBadge mode={activeMode}/>{health?.mode==='mock'&&<div className="mode-note">演示模式根据资料生成规则化内容，用于体验完整流程。配置 API 后可使用真实 AI。</div>}{sampled&&<div className="context-note">资料较长，本次使用均匀抽取的片段，结果可能未覆盖全部内容。建议按章节上传。</div>}
      {busy&&<div className="working" role="status"><LoaderCircle className="spin" size={16}/>{busy}中，请稍候…</div>}
      {view==='source'&&<><section className="source-card"><div className="card-title"><FileText size={18}/><h2>课程原文</h2><span>{material.type.toUpperCase()}</span></div><div className="source-text">{material.text}</div></section><div className="next-step"><div><strong>读懂资料的第一步</strong><p>让 AI 帮你整理主线与核心知识点。</p></div><button className="button primary" onClick={()=>generate('summary')} disabled={!!busy}>提炼重点 <ArrowRight size={17}/></button></div></>}
      {view==='summary'&&(summary?<><section className="overview-card"><span className="mini-label"><Lightbulb size={16}/> 本章在讲什么</span><p>{summary.data.overview}</p></section><div className="content-section-title"><h2>核心知识点</h2><span>{summary.data.concepts.length} 个学习重点</span></div><div className="concept-grid">{summary.data.concepts.map((c,i)=><article className="concept-card" key={i}><div className="concept-top"><span>{String(i+1).padStart(2,'0')}</span><span className="stars" aria-label={`重要程度 ${c.importance} 星`}>{'★'.repeat(c.importance)}<em>{'★'.repeat(3-c.importance)}</em></span></div><h3>{c.name}</h3><p>{c.explanation}</p></article>)}</div><div className="priority-grid"><section><h3><CheckCircle2 size={18}/> 必须掌握</h3><ul>{summary.data.mustKnow.map((s,i)=><li key={i}>{s}</li>)}</ul></section><section><h3><BookOpen size={18}/> 可以略读</h3><ul>{summary.data.skim.map((s,i)=><li key={i}>{s}</li>)}</ul></section></div><button className="button primary" onClick={()=>generate('outline')} disabled={!!busy}>下一步：生成复习提纲 <ArrowRight size={17}/></button></>:<Empty icon="summary" title="给知识画出重点" description="根据当前资料提炼主线、核心知识点与学习优先级。" action="提炼重点" onClick={()=>generate('summary')} disabled={!!busy}/>)}
      {view==='outline'&&(outline?<><div className="outline-legend">{['理解','记忆','计算','易错'].map(t=><span key={t} className={`tag tag-${t}`}>{t}</span>)}<span>不同知识，用不同方法学。</span></div><div className="outline-list">{outline.data.sections.map((section,i)=><section className="outline-section" key={i}><div className="outline-title"><span>{String(i+1).padStart(2,'0')}</span><h2>{section.title}</h2></div>{section.items.map((item,j)=><div className="outline-item" key={j}><span className="outline-bullet"/><div><h3>{item.title}</h3><p>{item.detail}</p></div><span className={`tag tag-${item.type}`}>{item.type}</span></div>)}</section>)}</div><button className="button primary" onClick={()=>generate('quiz')} disabled={!!busy}>用测验检查掌握情况 <ArrowRight size={17}/></button></>:<Empty icon="outline" title="把零散知识串起来" description="按逻辑组织资料，标记理解、记忆、计算和易错内容。" action="生成复习提纲" onClick={()=>generate('outline')} disabled={!!busy}/>)}
      {view==='qa'&&<div className="qa-area">{!chats.length&&<div className="qa-welcome"><span className="qa-icon"><MessageCircle size={28}/></span><h2>把疑问说出来。</h2><p>试着问一个具体的问题，或者从下面开始。</p><div className="suggested-questions">{['这份资料的核心概念是什么？','训练集和测试集有什么区别？','什么是过拟合？'].map(q=><button key={q} onClick={()=>ask(q)} disabled={!!busy}>{q}<ArrowUpRight size={15}/></button>)}</div></div>}{chats.map((chat,i)=><section key={i} className="chat-turn"><div className="user-question"><span>你</span><p>{chat.question}</p></div><div className="ai-answer"><div className="answer-heading"><span className="brand-mark small"><Layers3 size={15}/></span><strong>StudyForge AI</strong><ModeBadge mode={chat.response.mode}/></div><p className="answer-text">{chat.response.data.answer}</p><span className={`grounding-label ${chat.response.data.grounded?'':'supplement'}`}>{chat.response.data.grounded?'依据资料片段':'包含资料外说明'}</span>{chat.response.sources.length>0&&<div className="citations">{chat.response.sources.map(source=><details key={source.id}><summary><FileText size={14}/>{source.id} · 原文第 {source.start+1} 字起 <ChevronRight size={13}/></summary><p>{source.text}</p></details>)}</div>}</div></section>)}<form className="question-box" onSubmit={e=>{e.preventDefault();ask();}}><label htmlFor="question">你的问题</label><textarea id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="例如：为什么训练分数很高，实际表现却不好？" maxLength={1000} rows={3}/><div><span>资料优先 · 引用可核对</span><button className="button primary" disabled={!question.trim()||!!busy} type="submit">发送问题 <ArrowRight size={16}/></button></div></form></div>}
      {view==='quiz'&&(quiz?<><div className="quiz-toolbar"><span><ListChecks size={17}/> {quiz.data.questions.length} 道题 · 单选 / 判断</span><span>已完成 {Object.keys(answers).length} / {quiz.data.questions.length}</span></div><div className="quiz-progress"><span style={{width:`${Object.keys(answers).length/quiz.data.questions.length*100}%`}}/></div>{quiz.data.questions.map((q,i)=><section className="question-card" key={q.id}><div className="question-meta"><span>QUESTION {String(i+1).padStart(2,'0')}</span><span className="tag">{q.type==='single'?'单项选择':'判断题'}</span></div><h2>{q.question}</h2><div className="options" role="radiogroup" aria-label={`第${i+1}题`}>{q.options.map((option,j)=><label className={`option ${answers[q.id]==='ABCD'[j]?'selected':''}`} key={j}><input type="radio" name={`question-${q.id}`} value={'ABCD'[j]} checked={answers[q.id]==='ABCD'[j]} onChange={()=>setAnswers(a=>({...a,[q.id]:'ABCD'[j]}))} disabled={!!busy||!!result}/><span className="option-letter">{'ABCD'[j]}</span><span>{option}</span>{answers[q.id]==='ABCD'[j]&&<Check size={17}/>}</label>)}</div></section>)}<div className="quiz-submit"><p>提交后显示得分、解析与针对本次错题的复习建议。</p>{result?<button className="button primary" onClick={()=>setView('result')}>查看学习报告 <ArrowRight size={17}/></button>:<button className="button primary" disabled={Object.keys(answers).length!==quiz.data.questions.length||!!busy} onClick={submit}>提交答案 <ArrowRight size={17}/></button>}</div></>:<Empty icon="quiz" title="一次小测验，一次新发现" description={`将根据课程资料生成 ${count} 道单选与判断题。完成后查看得分和复习建议。`} action="生成测试" onClick={()=>generate('quiz')} disabled={!!busy}/>)}
      {view==='result'&&(result?<><section className="score-card"><div className="score-circle"><strong>{result.score}</strong><span>本次得分</span></div><div><span className="mini-label">这一次，你又前进了一步</span><h2>{result.score===100?'理解得不错，继续保持。':result.score>=60?'找到薄弱点，就是进步的开始。':'从错题出发，把基础补扎实。'}</h2><div className="score-stats"><span><CheckCircle2 size={16}/> 正确 <b>{result.correctCount}</b> 题</span><span><CircleHelp size={16}/> 错误 <b>{result.wrongCount}</b> 题</span><span>共 {result.total} 题</span></div></div></section><div className="report-tabs"><button className={reportTab==='answers'?'active':''} onClick={()=>setReportTab('answers')}>答题解析</button><button className={reportTab==='review'?'active':''} onClick={()=>setReportTab('review')}>AI 复习建议{review&&<span className="nav-dot"/>}</button></div>{reportTab==='answers'?<div className="result-details">{result.details.map((q,i)=><section className={`result-question ${q.correct?'correct':'incorrect'}`} key={q.id}><div className="result-question-heading"><span className="result-number">{i+1}</span><h3>{q.question}</h3><span className={`tag ${q.correct?'tag-理解':'tag-易错'}`}>{q.correct?'正确':'错误'}</span></div><div className="answer-comparison"><span>你的答案 <b>{q.selected}</b></span><span>正确答案 <b>{q.answer}</b></span></div><p className="correct-option">{q.answer}. {q.options['ABCD'.indexOf(q.answer)]}</p><div className="explanation"><Lightbulb size={16}/><p>{q.explanation}</p></div></section>)}</div>:review?<div className="review-content"><section className="overview-card"><span className="mini-label"><Sparkles size={16}/> 本次复习建议</span><p>{review.data.overview}</p><ModeBadge mode={review.mode}/></section><div className="content-section-title"><h2>优先补齐这些知识</h2><span>仅依据本次测试</span></div><div className="weaknesses">{review.data.weaknesses.length?review.data.weaknesses.map((w,i)=><span key={i}><Target size={16}/>{w}</span>):<span><CheckCircle2 size={16}/> 本次未发现错题知识点</span>}</div><h2 className="review-steps-title">接下来这样复习</h2>{review.data.steps.map((step,i)=><section className="review-step" key={i}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{step.title}</h3><p>{step.action}</p></div></section>)}<button className="button secondary" onClick={()=>setView('outline')}>回到复习提纲 <ArrowRight size={16}/></button></div>:<Empty icon="result" title="为错题找到下一步" description="成绩已经保留。生成基于本次表现的复习建议。" action="生成复习建议" onClick={regenerateReview} disabled={!!busy}/>}</>:<Empty icon="result" title="完成测验，发现进步" description="先完成一组测试，这里会展示成绩、逐题解析和复习建议。" action="前往自我测试" onClick={()=>setView('quiz')}/>)}
      <footer className="study-footer">AI 结果用于辅助学习。重要结论请结合原文与教师要求核对。</footer></main>
      <aside className="actions-panel"><div className="panel-heading"><Sparkles size={18}/><h2>学习助手</h2></div><p className="panel-intro">少一点迷茫，<br/>多一点有方向的学习。</p><div className="sidebar-label">一步一步，学得更扎实</div><div className="action-stack"><button aria-label="提炼重点" onClick={()=>generate('summary')} disabled={!!busy}><span className="action-icon"><Sparkles size={18}/></span><div><strong>提炼重点</strong><span>先抓住课程主线</span></div><ChevronRight size={16}/></button><button aria-label="生成复习提纲" onClick={()=>generate('outline')} disabled={!!busy}><span className="action-icon"><Layers3 size={18}/></span><div><strong>生成复习提纲</strong><span>建立你的知识框架</span></div><ChevronRight size={16}/></button><button aria-label="解释知识点" onClick={()=>setView('qa')} disabled={!!busy}><span className="action-icon"><MessageCircle size={18}/></span><div><strong>解释知识点</strong><span>带着疑问深入理解</span></div><ChevronRight size={16}/></button></div><div className="test-generator"><div className="mini-label"><ListChecks size={16}/> 检验一下掌握程度</div><div className="count-toggle" role="group" aria-label="题目数量">{([5,10] as const).map(n=><button key={n} onClick={()=>setCount(n)} className={count===n?'selected':''} disabled={!!busy}>{n} 题</button>)}</div><button className="button primary" onClick={()=>generate('quiz')} disabled={!!busy}>{quiz?<RotateCcw size={15}/>:<Plus size={15}/>}生成测试</button>{quiz&&<p>重新生成会开始一场新测验。</p>}</div><div className="study-tip"><span><Lightbulb size={18}/> 学习小提示</span><p>试着合上资料，用自己的话解释一个概念。能讲明白，才是真正理解。</p></div><div className="model-info"><ModeBadge mode={health?.mode}/><p>{health?.model||'正在连接本地服务'}</p></div></aside>
    </div>}
  </div>;
}
function Empty({icon,title,description,action,onClick,disabled=false}:{icon:View;title:string;description:string;action:string;onClick:()=>void;disabled?:boolean}) {const Icon=icons[icon];return <section className="empty-state"><span><Icon size={30}/></span><h2>{title}</h2><p>{description}</p><button className="button primary" onClick={onClick} disabled={disabled}>{action}<ArrowRight size={17}/></button></section>;}
