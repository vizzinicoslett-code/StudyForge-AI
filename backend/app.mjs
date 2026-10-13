import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseFile, checkText } from './materials.mjs';
import { chunkText } from './retrieval.mjs';
import { createProvider } from './provider.mjs';
import { AppError } from './errors.mjs';
import { demoName, demoText } from './data/demo.mjs';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
export function createApp(config = {}) {
  const app=express();
  const provider=createProvider(config);
  const materials=new Map(), quizzes=new Map();
  const ttl=config.ttl || 24*60*60*1000;
  const capacity=30;
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
  app.use(express.json({limit:'1mb'}));
  app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
  const prune=()=>{
    for(const [id,m] of materials) if(Date.now()-m.createdAt>ttl) materials.delete(id);
    for(const [id,q] of quizzes) if(!materials.has(q.materialId) || Date.now()-q.createdAt>ttl) quizzes.delete(id);
  };
  const publicMaterial=({chunks,createdAt,...rest})=>rest;
  function addMaterial(name,text,type,size) {
    prune();
    if(materials.size>=capacity) {materials.delete(materials.keys().next().value);prune();}
    const m={id:randomUUID(),name,text,type,size,characters:text.length,chunks:chunkText(text),createdAt:Date.now()};
    materials.set(m.id,m);return publicMaterial(m);
  }
  function getMaterial(id) {
    prune();const material=materials.get(id);
    if(!material) throw new AppError('MATERIAL_EXPIRED','学习记录已过期或服务已重启，请返回首页重新打开最近记录。',404);
    return material;
  }
  app.get('/api/health',(_req,res)=>res.json({ok:true,mode:provider.mode,model:provider.model}));
  app.post('/api/materials/demo',(_req,res)=>res.json(addMaterial(demoName,demoText,'md',Buffer.byteLength(demoText))));
  app.post('/api/materials/upload',upload.single('file'),async(req,res)=>{
    if(!req.file) throw new AppError('FILE_REQUIRED','请选择要上传的课程资料。');
    // 浏览器上传的 Unicode 文件名在 multipart 中可能被按 Latin-1 解码。
    const rawName=req.file.originalname;
    const fixed=Buffer.from(rawName,'latin1').toString('utf8');
    if(!fixed.includes('\ufffd') && /[^\x00-\x7f]/.test(rawName)) req.file.originalname=fixed;
    const parsed=await parseFile(req.file);
    res.json(addMaterial(req.file.originalname,parsed.text,parsed.type,req.file.size));
  });
  app.post('/api/materials/restore',(req,res)=>{
    const data=z.object({name:z.string().min(1).max(250),text:z.string().max(100000),type:z.enum(['md','txt','pdf']),size:z.number().min(0).max(10485760)}).parse(req.body);
    res.json(addMaterial(data.name,checkText(data.text),data.type,data.size));
  });
  app.post('/api/ai/:task',async(req,res)=>{
    const task=req.params.task;
    if(!['summary','outline','qa','quiz'].includes(task)) throw new AppError('TASK_INVALID','不支持的学习操作。',404);
    const input=z.object({materialId:z.string().uuid(),question:z.string().trim().min(1).max(1000).optional(),count:z.union([z.literal(5),z.literal(10)]).optional()}).parse(req.body);
    if(task==='qa'&&!input.question) throw new AppError('QUESTION_REQUIRED','请输入要解释的问题。');
    const material=getMaterial(input.materialId);
    const result=await provider.generate(task,material,{question:input.question,count:input.count||5});
    if(task==='quiz') {
      if(quizzes.size>=90) quizzes.delete(quizzes.keys().next().value);
      const quizId=randomUUID();
      quizzes.set(quizId,{materialId:material.id,questions:result.data.questions,mode:result.mode,createdAt:Date.now()});
      result.data={quizId,questions:result.data.questions.map(({answer,explanation,...q},i)=>({...q,id:String(i+1)}))};
    }
    res.json(result);
  });
  app.post('/api/quizzes/:id/submit',(req,res)=>{
    prune();const quiz=quizzes.get(req.params.id);
    if(!quiz) throw new AppError('QUIZ_EXPIRED','本次测验已过期，请重新生成。',404);
    const {answers}=z.object({answers:z.record(z.string(),z.enum(['A','B','C','D']))}).parse(req.body);
    if(Object.keys(answers).length!==quiz.questions.length) throw new AppError('ANSWERS_INCOMPLETE','请先完成所有题目再提交。');
    const details=quiz.questions.map((q,i)=>{
      const selected=answers[String(i+1)];
      if(!selected || 'ABCD'.indexOf(selected)>=q.options.length) throw new AppError('ANSWER_INVALID','答案不完整或包含无效选项。');
      return {...q,id:String(i+1),selected,correct:selected===q.answer};
    });
    const correctCount=details.filter(d=>d.correct).length;
    const result={quizId:req.params.id,score:Math.round(correctCount/details.length*100),total:details.length,correctCount,wrongCount:details.length-correctCount,details,mode:quiz.mode};
    quiz.result=result;res.json(result);
  });
  app.post('/api/quizzes/:id/review',async(req,res)=>{
    prune();const quiz=quizzes.get(req.params.id);
    if(!quiz?.result) throw new AppError('RESULT_REQUIRED','请先提交这次测验的答案。');
    // 不信任客户端传入的分数或错题，使用服务端评分结果。
    res.json(await provider.generate('review',getMaterial(quiz.materialId),{result:quiz.result}));
  });
  const dist=fileURLToPath(new URL('../frontend/dist/',import.meta.url));
  if(existsSync(dist)) {
    app.use(express.static(dist,{maxAge:0}));
    app.get('/{*path}',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(`${dist}/index.html`));
  }
  app.use((_req,_res,next)=>next(new AppError('NOT_FOUND','请求的页面或接口不存在。',404)));
  app.use((error,_req,res,_next)=>{
    if(error instanceof z.ZodError) return res.status(400).json({error:{code:'INPUT_INVALID',message:'输入格式不正确，请检查资料、问题或题目数量。'}});
    if(error instanceof multer.MulterError) return res.status(400).json({error:{code:'UPLOAD_LIMIT',message:'上传失败：单个文件不能超过 10 MB，且一次只能上传一个文件。'}});
    if(error.type==='entity.too.large') return res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'请求内容过大，请按章节拆分资料。'}});
    if(error instanceof SyntaxError && 'body' in error) return res.status(400).json({error:{code:'INVALID_BODY',message:'请求正文不是有效 JSON。'}});
    res.status(error.status||500).json({error:{code:error.code||'SERVER_ERROR',message:error instanceof AppError?error.message:'服务暂时无法处理请求，请重试。'}});
  });
  return app;
}
