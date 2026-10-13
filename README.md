# StudyForge AI

源码仓库：[vizzinicoslett-code/StudyForge-AI](https://github.com/vizzinicoslett-code/StudyForge-AI)

在线体验：部署待完成，取得真实公网地址并验收后再填写。

**把课程资料变成你的 AI 复习助手。**《人工智能入门指南》课程项目。当前公开课程展示版本默认使用 **Mock 演示模式 / 本地规则处理**，无需 OpenAI API Key、无需付费 AI 服务，也不使用本地大模型。

## 使用流程与功能

上传 PDF / TXT / Markdown → 提炼重点 → 复习提纲 → 资料问答 → 5 / 10 题测验 → 自动评分与复习建议。没有资料时点击「体验示例课程」。

重点提炼会清理页码、邮箱、页眉页脚和公式碎片，恢复完整句子，再按定义、结论、词频和章节位置排序；不强行凑够十条。提纲提供学习类型标签，问答可展开原文片段。Mock 是规则演示，不是大语言模型推理。

最近资料、重点、提纲和问答保存在当前浏览器；服务器内存暂存资料和测验。服务重启或免费实例休眠后，进行中的测验可能失效，请重新生成；最近资料可以在同一浏览器恢复。

## 本地安装和启动

需要 Node.js 24（项目用 24.20.0 验证）和 npm。进入解压或克隆得到的 StudyForge-AI 目录：

```sh
npm ci --include=dev
npm run build
npm start
```

打开 http://127.0.0.1:3001，按 Ctrl+C 停止。开发模式用 `npm run dev` 并打开 http://127.0.0.1:5173。Windows 可运行 `启动-StudyForge.ps1`。

无需创建 .env；如需调整本地端口，可复制 .env.example 为 .env。默认 AI_MODE=mock。无需填写任何密钥，公开部署也不需要任何密钥。

## 部署架构

GitHub 托管源码；Render **Free Node Web Service** 同时提供前端静态资源与 Express /api 接口。保留现有 React + Vite + TypeScript 前端、Node + Express 后端，未改 UI 或新增功能。

不使用 GitHub Pages：上传解析、规则生成、答案保管和评分当前由 Express 完成。GitHub Pages 只托管静态文件，不能长期运行这个后端；为它迁移全部功能会扩大改动范围。

仓库根目录已有 render.yaml：

- runtime: node，plan: free，Node.js 24.20.0。
- Build：`npm ci --include=dev && npm run build`。生产构建也需要 Vite 和 TypeScript，所以包含 dev 依赖。
- Start：`npm start`。
- NODE_ENV=production、HOST=0.0.0.0、AI_MODE=mock；端口由平台 PORT 提供。
- 健康检查 `/api/health`。前端使用相对 `/api` 地址，无固定云端域名。

在 Render 用 GitHub 登录，New → Blueprint，选择本仓库，确认仅有一个 Free Web Service 后部署。如果账号界面不提供免费 Blueprint 流程，可使用 New → Web Service，选择同一仓库并填写上面的构建、启动、环境变量和健康检查配置。

老师取得实际公网网址后，不需要登录、安装 Node 或下载源码。尚未取得 URL 时不能将部署准备写成部署成功。

Render 免费实例连续 15 分钟没有流量会休眠，下一次请求唤醒通常约需一分钟。免费额度也受实例时长、流量和构建分钟限制；不升级付费实例、不添加付费数据库或磁盘。不添加付款方式时，超额会暂停服务或构建。实际额度与规则以 [Render 免费说明](https://render.com/docs/free) 为准。

## 资料与隐私

- demo-materials/ 和 backend/data/ 仅使用项目自制 AI 基础资料。
- tests/ 使用虚构机构、讲师和 example.invalid 保留域名，不包含真实教师联系方式。
- screenshots/ 仅展示自制 Demo；公开提交前由无界面浏览器重新生成和检查。
- artifacts/、private-materials/、uploads/、.env、node_modules/、缓存和本机构建不进入 GitHub。
- 私有课件及其摘录、验收报告不进入公开展示包。不要将真实课堂原始 PDF 添加到仓库。
- 上传文件在内存解析，不写服务器磁盘；本课程展示版本不把资料发送到 AI 服务。

公开目录中的文档只使用相对项目路径，不记录本机用户名、私人联系方式或凭据。

## 工程结构

```text
frontend/          React 页面、样式、类型与 Vite 配置
backend/           Express API、解析、检索、Mock 和评分
backend/prompts/   原设计的独立提示词；Mock 不调用这些模型提示词
backend/data/      自制示例课程
scripts/           后台验收、公开隐私检查、打包
 tests/            单元与 API 回归测试
 demo-materials/   可公开的自制 PDF / TXT / MD
 docs/submission/  课程提交材料与在线部署说明
 screenshots/      九张公开 Demo 展示图
 render.yaml       免费 Render 部署配置
```

## 验证

```sh
npm test
npm run build
npm run test:e2e
node scripts/startup-smoke.mjs
node scripts/deployment-smoke.mjs
node scripts/privacy-check.mjs
```

E2E 使用 Playwright headless，Windows 可使用现有 Edge / Chrome；Linux 测试环境先安装 Playwright Chromium。可通过 BROWSER_EXECUTABLE 指定浏览器。测试记录保存在被忽略的 artifacts/，公开概要见 docs/测试报告.md。

公网部署取得 URL 后，运行 `node scripts/deployment-smoke.mjs --url https://实际域名` 检查网页、静态资源、页面刷新与完整 Mock 流程。脚本仅使用自制资料，不需要账号或 API Key。

## 常见问题

扫描或加密 PDF：V1 不含 OCR，先转换为可读文本 PDF；损坏文件有错误提示。TXT / Markdown 使用 UTF-8。单文件 ≤10 MB、文本 ≤10 万字符。

端口占用：停止旧服务或修改 PORT。修改开发后端端口时也调整 Vite 本地代理。云端不要把 HOST 设为 127.0.0.1；render.yaml 已设置 0.0.0.0。

刷新、服务重启后测验失效：重新生成一组测验。免费服务不是永久资料存储，不保证考试级稳定性。

## 课程材料

docs/submission/ 包含成果说明、操作步骤、提示词原文、AI 原理、实际问题记录、分工模板、录屏脚本、答辩稿和在线部署说明。分工、成员姓名与学号保留占位符，不在公开版本填写个人信息。
