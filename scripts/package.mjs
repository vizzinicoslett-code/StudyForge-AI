import { cp, mkdir, readdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(dirname(root),'submission-public');
const api=JSON.parse(await readFile(resolve(root,'artifacts/api-results.json'),'utf8'));
const e2e=JSON.parse(await readFile(resolve(root,'artifacts/e2e-results.json'),'utf8'));
if(!api.passed||!e2e.passed||!existsSync(resolve(root,'frontend/dist/index.html')))throw new Error('缺少通过的测试证据或正式构建');
const publicManifest=JSON.parse(await readFile(resolve(root,'artifacts/public-manifest.json'),'utf8'));
if(!publicManifest.passed)throw new Error('必须先通过公开隐私检查');
await mkdir(output,{recursive:true});
const packagePaths=[];
for(const file of publicManifest.files){
  const buffer=await readFile(resolve(root,file.path));
  if(createHash('sha256').update(buffer).digest('hex')!==file.sha256)throw new Error(`文件已变更，请重新审查：${file.path}`);
  const target=resolve(output,'StudyForge-AI',file.path);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,buffer);packagePaths.push(target);
}
// 正式构建可供解压后本地启动；GitHub 上由 Render 自行构建。
await cp(resolve(root,'frontend/dist'),resolve(output,'StudyForge-AI/frontend/dist'),{recursive:true});
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await collect(path);else packagePaths.push(path);}}
await collect(resolve(output,'StudyForge-AI/frontend/dist'));
await cp(resolve(root,'docs/submission'),resolve(output,'课程作业材料'),{recursive:true});
await cp(resolve(root,'screenshots'),resolve(output,'截图'),{recursive:true});
await cp(resolve(root,'docs/测试报告.md'),resolve(output,'课程作业材料/09-测试报告.md'));
await cp(resolve(root,'docs/最终验收清单.md'),resolve(output,'课程作业材料/10-最终验收清单.md'));
await writeFile(resolve(output,'README.md'),`# StudyForge AI 公开课程展示包\n\n课程：《人工智能入门指南》\n\n源码：https://github.com/vizzinicoslett-code/StudyForge-AI\n\n组号：[待填写]　成员：[待填写，公开副本不填私人信息]\n\n当前版本为 Mock / 本地规则处理，无需任何 API Key 或付费 AI 服务。\n\nStudyForge-AI/ 包含源码、锁文件、正式构建、自制 Demo、测试和部署配置；课程作业材料/ 包含九份课程文档、测试报告和验收清单；截图/ 包含十张自制 Demo 截图。\n\n进入 StudyForge-AI 首次执行 npm ci --include=dev，必要时 npm run build，然后 npm start，访问 http://127.0.0.1:3001。\n\n${api.tests} 项后台测试与 ${e2e.checks.length} 项 headless 检查通过；公网状态以在线部署说明为准，未取得实际 URL 前不声称部署完成。\n\n不包含原始私人课件、本机摘录、artifacts、node_modules、.env 或任何凭据。按脚本自行录屏，仅使用自制 Demo。\n`,'utf8');
await collect(resolve(output,'课程作业材料'));await collect(resolve(output,'截图'));packagePaths.push(resolve(output,'README.md'));
const files=[];
for(const path of [...new Set(packagePaths)]){const buffer=await readFile(path);files.push({path:relative(output,path).replaceAll('\\','/'),bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});}
await writeFile(resolve(output,'提交文件清单.json'),JSON.stringify({format:'StudyForge AI V1 submission',files},null,2));
const archive=resolve(dirname(root),'组号-StudyForgeAI-成员姓名-公开展示版.zip');
const entries={};
for(const file of files)entries[`submission/${file.path}`]=new Uint8Array(await readFile(resolve(output,file.path)));
entries['submission/提交文件清单.json']=new Uint8Array(await readFile(resolve(output,'提交文件清单.json')));
await writeFile(archive,zipSync(entries,{level:6}));
const info=await stat(archive);
await writeFile(resolve(root,'artifacts/package-result.json'),JSON.stringify({archive,directory:output,bytes:info.size,files:files.length+1,excludes:['node_modules','.env','Git metadata'],remoteModelTested:false},null,2));
console.log(`提交包已生成：${archive}\n文件数：${files.length+1}，大小：${(info.size/1024/1024).toFixed(2)} MB`);
