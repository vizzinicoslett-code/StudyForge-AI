import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=promisify(execFile);
const {stdout}=await run('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,windowsHide:true,maxBuffer:5*1024*1024});
const files=[...new Set(stdout.split('\0').filter(Boolean))].sort();
const issues=[],proof=[];
const patterns=[
  ['本机绝对路径',/\b[A-Za-z]:[\\/]|\/(?:Users|home)\/[^\s/]+\//g],
  ['疑似令牌',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{24,})/g],
  ['疑似手机号',/\b1[3-9]\d{9}\b/g],
  ['已填写学号',/学号\s*[:：]\s*\d{5,}/g]
];
function scan(text,path){
  for(const [kind,regex] of patterns){regex.lastIndex=0;if(regex.test(text))issues.push({path,kind});}
  const emails=text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[];
  if(emails.some(email=>!email.endsWith('@example.invalid')))issues.push({path,kind:'非虚构邮箱'});
}
for(const path of files){
  if(/^(?:artifacts|node_modules|\.git|\.local|private-materials|uploads)\//.test(path)||(/^\.env/.test(path)&&path!=='.env.example')){issues.push({path,kind:'禁止公开的文件'});continue;}
  const data=await readFile(new URL(`../${path}`,import.meta.url));
  if(path.endsWith('.pdf')){
    if(path!=='demo-materials/AI-基础示例.pdf'){issues.push({path,kind:'未经确认的 PDF'});continue;}
    const parser=new PDFParse({data,verbosity:0});
    try{const text=(await parser.getText()).text;scan(text,path);if(!text.includes('Artificial Intelligence Basics')||!text.includes('Supervised learning uses labeled examples'))issues.push({path,kind:'PDF 与声明的自制 Demo 不符'});}
    finally{await parser.destroy();}
  }else if(path.endsWith('.png')){
    // 浏览器生成截图没有私有 EXIF；拒绝 PNG 中的文本元数据。
    let offset=8;
    while(offset+12<=data.length){const length=data.readUInt32BE(offset);const type=data.toString('ascii',offset+4,offset+8);if(['tEXt','iTXt','zTXt','eXIf'].includes(type))issues.push({path,kind:'图片文本或 EXIF 元数据'});offset+=length+12;}
  }else scan(data.toString('utf8'),path);
  proof.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/public-manifest.json',import.meta.url),JSON.stringify({passed:!issues.length,files:proof,issues},null,2));
if(issues.length){console.error(JSON.stringify(issues,null,2));process.exitCode=1;}
else{console.log(`公开提交审查通过：${proof.length} 个文件；PDF 仅自制示例，未检出真实邮箱、令牌或本机绝对路径。`);}
