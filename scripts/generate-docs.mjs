import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { systemPrompt, templates } from '../backend/prompts/index.mjs';
import { outputSchemas } from '../backend/schemas.mjs';
const docs=new URL('../docs/',import.meta.url);
await mkdir(new URL('submission/',docs),{recursive:true});
const metadata={summary:['重点总结','课程资料片段','课程主线、核心知识点、必须掌握与可以略读'],outline:['复习提纲','课程资料片段','按部分组织的提纲与四类学习标签'],qa:['知识点问答','学生问题与检索到的相关课程片段','回答、是否有完整资料依据与引用编号'],quiz:['自动出题','课程资料片段、题数 5 或 10','题型、题目、选项、答案、解析与知识点'],review:['复习建议','服务器计算的本次成绩与错题、相关课程片段','概况、薄弱知识点与具体复习动作']};
let prompts='# 关键提示词原文\n\n本文由实际项目文件自动导出，原文与运行时一致。每次调用先发送系统提示词，再发送任务说明、课程上下文和输出 Schema。`{{context}}` 等是运行时替换变量，变量只替换一次。\n\n## 公用 System Prompt\n\n来源：`backend/prompts/systemPrompt.txt`\n\n```text\n'+systemPrompt+'\n```\n';
for(const [task,[name,input,output]] of Object.entries(metadata)) {
  prompts+=`\n## ${name} Prompt\n\n用途：${output}。\n\n输入：${input}。\n\n文件：\`backend/prompts/${task}Prompt.txt\`。\n\nPrompt 原文：\n\n\`\`\`text\n${templates[task]}\n\`\`\`\n\n模型输出格式（运行时 Output Schema）：\n\n\`\`\`json\n${JSON.stringify(outputSchemas[task],null,2)}\n\`\`\`\n`;
}
prompts+='\n## 校验与运行说明\n\n五项输出均由后端检查。出题除 Schema 外，还检查指定题数、单选 4 选项、判断 2 个固定选项、答案范围以及重复题目/选项。问答核验引用编号在当前片段内，未被资料完整支持的解释加固定提示。测验答案在提交前不返回客户端。Mock 使用规则生成器，不调用这些提示词或远程模型；提示词只用于真实 AI 模式。\n';
await writeFile(new URL('submission/03-关键提示词.md',docs),prompts);
const api=JSON.parse(await readFile(new URL('../artifacts/api-results.json',import.meta.url),'utf8'));
const e2e=JSON.parse(await readFile(new URL('../artifacts/e2e-results.json',import.meta.url),'utf8'));
const production=JSON.parse(await readFile(new URL('../artifacts/deployment-results.json',import.meta.url),'utf8'));
if(!api.passed||!e2e.passed||!production.passed)throw new Error('不能在测试失败时生成公开验收报告');
const report=`# 公开展示版本测试报告\n\n日期：2026-10-13（Asia/Shanghai）。当前版本默认 Mock，无需任何 AI Key，不调用远程模型。\n\n| 验证 | 结果 |\n|---|---|\n| npm ci --include=dev | 完成，锁定依赖安装审计 0 漏洞 |\n| TypeScript + Vite 正式构建 | 通过 |\n| 后台单元与 API 回归 | ${api.tests} 项通过，${api.failed} 项失败 |\n| Headless 浏览器 | ${e2e.checks.length} 项通过 |\n| 本地生产模拟 | ${production.checks.length} 项通过 |\n| 公开截图 | 10 张，全部使用自制 Demo |\n| 公网 / Linux | 尚未部署，不能标记为通过 |\n\n## 浏览器验收\n\n${e2e.checks.map(x=>`- ${x}`).join('\n')}\n\n## 生产模拟\n\n${production.checks.map(x=>`- ${x}`).join('\n')}\n\n验证使用 Windows 上的生产环境参数、平台 PORT 和 0.0.0.0 监听。原测试端口被其他本机服务占用时，改用空闲端口；没有终止用户其他服务。此结果不冒充 Linux 云端实测。\n\n## 隐私与模式\n\n测试的机构、讲师及联系方式均为虚构占位，域名为 example.invalid。PDF 和课程截图来自项目自制资料，真实课程 PDF 和本机资料摘录不公开。兼容协议和异常测试只使用本机 HTTP 测试服务，没有调用付费或在线模型。原始测试日志位于被忽略的 artifacts/，不进入公开仓库。\n\n## 公网后续检查\n\n部署取得真实 URL 后执行 node scripts/deployment-smoke.mjs --url https://实际域名；验证首页、资源、刷新、健康检查、上传、Mock 总结/提纲/问答、5/10 题与评分建议。云端结果通过后更新在线部署说明。\n`;
await writeFile(new URL('测试报告.md',docs),report);
const checklist=`# 公开展示版本验收清单\n\n${['本地安装、构建与持续启动','前端页面和静态资源','自制示例课程及 PDF/TXT/MD 上传','Mock 重点、提纲、问答','5/10 题测验、答案隐藏、服务端评分和复习建议','同源 /api 与公开健康检查','云端 HOST 与 PORT 配置','Mock 默认模式，无需 API Key','源码、锁文件、Prompt、README、课程材料','公开截图仅使用自制资料','真实课件、个人信息、.env 和本机 artifacts 排除'].map(x=>`- [x] ${x}`).join('\n')}\n\n- [ ] 推送到指定 GitHub 后逐文件核验。\n- [ ] Render 免费服务部署成功并取得真实公网 URL。\n- [ ] 公网 / Linux 完整流程验收通过。\n- [ ] 部署后更新 README 和在线访问说明。\n\n成员身份与实际贡献由本人填写，公开版本不填写学号或私人信息。录屏按 Mock 分支介绍。\n`;
await writeFile(new URL('最终验收清单.md',docs),checklist);
console.log('提示词、公开测试报告与验收清单已生成；未公开本机路径或私有课件内容。');
