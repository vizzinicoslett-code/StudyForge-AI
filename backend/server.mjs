import dotenv from 'dotenv';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});

const host = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
// 由入口模块持有实例；HTTP 监听句柄负责维持事件循环，不使用定时器保活。
let server;

try {
  const rawPort = process.env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 3001;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1～65535 之间的整数，默认端口为 3001。');
  }

  const app=createApp({key:process.env.OPENAI_API_KEY,baseUrl:process.env.OPENAI_BASE_URL,model:process.env.OPENAI_MODEL,mode:process.env.AI_MODE || 'mock',jsonMode:process.env.OPENAI_JSON_MODE!=='false',timeout:Math.max(1000,Number(process.env.AI_TIMEOUT_MS)||45000)});

  // Express 5 的 app.listen 回调也会在 error 时执行；使用原生事件避免误报成功。
  server = createServer(app);
  server.on('error', error => {
    const message = error.code === 'EADDRINUSE'
      ? `端口 ${port} 已被占用，请停止旧进程或修改 PORT。`
      : `服务器启动失败（${error.code || 'UNKNOWN'}）：${error.message}`;
    console.error(message);
    process.exitCode = 1;
  });
  server.once('listening', () => {
    server.ref();
    console.log(`StudyForge AI 已启动：http://${host}:${port}`);
    console.log('HTTP 服务将持续运行，按 Ctrl+C 停止。');
  });
  server.listen({ port, host });
} catch(error) {console.error(`启动失败：${error.message}`);process.exitCode=1;}
