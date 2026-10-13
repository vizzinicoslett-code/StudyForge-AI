import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const host = '127.0.0.1';
const port = 3001;
const base = `http://${host}:${port}`;
// 直接运行 npm-cli.js start，避免测试另一个入口或随机端口。
const npmCli = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, AI_MODE: 'mock', OPENAI_API_KEY: '', PORT: String(port) };
const checks = [];
const childRecords = [];
let launched;
let serverPid;

function launch(extraEnv = {}) {
  const child = spawn(process.execPath, [npmCli, 'start'], {
    cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const record = { child, stdout: '', stderr: '', ended: false, closed: false, code: undefined, signal: undefined };
  child.stdout.on('data', data => { record.stdout += data.toString(); });
  child.stderr.on('data', data => { record.stderr += data.toString(); });
  child.on('exit', (code, signal) => { record.ended = true; record.code = code; record.signal = signal; });
  child.on('close', () => { record.closed = true; });
  child.on('error', error => { record.error = error; });
  childRecords.push(record);
  return record;
}

async function until(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('等待服务状态超时');
    await delay(100);
  }
}

async function listener() {
  if (process.platform === 'win32') {
    const { stdout } = await run('netstat.exe', ['-ano', '-p', 'tcp'], { windowsHide: true });
    const match = stdout.match(/^\s*TCP\s+127\.0\.0\.1:3001\s+\S+\s+LISTENING\s+(\d+)\s*$/m);
    assert.ok(match, 'Windows 未发现 127.0.0.1:3001 LISTENING');
    const pid = Number(match[1]);
    process.kill(pid, 0);
    return { address: host, port, state: 'LISTENING', pid };
  }
  const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  return { address: host, port, state: 'LISTENING' };
}

async function ensureFreePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen({ host, port }, resolve);
  }).catch(error => {
    if (error.code === 'EADDRINUSE') throw new Error('测试需要空闲的 3001 端口；请停止旧服务后重试，不会自动终止其他进程。');
    throw error;
  });
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
}

async function stopOwnedProcess() {
  if (process.platform === 'win32') {
    let treeStopped = false;
    for (const record of childRecords) {
      if (record.ended) continue;
      try {
        await run('taskkill.exe', ['/PID', String(record.child.pid), '/T', '/F'], { windowsHide: true });
        if (record === launched) treeStopped = true;
      } catch {}
    }
    // 只回收本次测试启动的监听进程；npm 包装进程可能已提前退出。
    if (serverPid && !treeStopped) await run('taskkill.exe', ['/PID', String(serverPid), '/F'], { windowsHide: true }).catch(() => {});
  } else {
    launched?.child.kill('SIGTERM');
  }
}

try {
  await ensureFreePort();
  const startedAt = Date.now();
  launched = launch();
  await until(() => launched.stdout.includes('StudyForge AI 已启动') || launched.ended || launched.error);
  if (launched.error) throw launched.error;
  assert.equal(launched.ended, false, `npm start 提前退出：${launched.stderr}`);
  const initialListener = await listener();
  serverPid = initialListener.pid;
  checks.push('npm start 真实命令启动后未退出');
  checks.push('127.0.0.1:3001 LISTENING');

  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const html = await home.text();
  assert.match(html, /StudyForge AI/);
  checks.push('GET / 返回 HTML 200');

  const resources = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(resources.some(path => path.endsWith('.js')) && resources.some(path => path.endsWith('.css')));
  for (const path of resources) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  checks.push('所有首页 JS / CSS 静态资源返回 200 且类型正确');

  const health = await fetch(`${base}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.mode, 'mock');
  const materialResponse = await fetch(`${base}/api/materials/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(materialResponse.status, 200);
  const material = await materialResponse.json();
  const summary = await fetch(`${base}/api/ai/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: material.id }) });
  assert.equal(summary.status, 200);
  assert.ok((await summary.json()).data.concepts.length >= 5);
  checks.push('健康检查、示例课程、重点 API 可访问');

  // 无请求空闲一段时间，专门检测“打印启动后就退出”的回归。
  await delay(30000);
  assert.equal(launched.ended, false, `npm start 在空闲期间退出：${launched.stderr}`);
  const finalListener = await listener();
  if (serverPid) assert.equal(finalListener.pid, serverPid, '监听进程被替换');
  assert.equal((await fetch(base)).status, 200);
  checks.push('空闲 30 秒后 npm 和同一个监听进程仍存活，首页仍返回 200');

  const conflict = launch();
  await until(() => conflict.closed || conflict.error);
  if (conflict.error) throw conflict.error;
  assert.equal(conflict.code, 1);
  assert.match(conflict.stderr, /端口 3001 已被占用/);
  assert.doesNotMatch(conflict.stdout, /StudyForge AI 已启动/);
  assert.equal(launched.ended, false);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  checks.push('端口冲突只报告失败，不误报启动，不影响已运行服务');

  const invalidPort = launch({ PORT: 'bad-port' });
  await until(() => invalidPort.closed || invalidPort.error);
  if (invalidPort.error) throw invalidPort.error;
  assert.equal(invalidPort.code, 1);
  assert.match(invalidPort.stderr, /PORT 必须/);
  assert.doesNotMatch(invalidPort.stdout, /StudyForge AI 已启动/);
  checks.push('非法端口配置明确失败');

  await writeFile(new URL('../artifacts/startup-results.json', import.meta.url), JSON.stringify({
    passed: true, server: 'backend/server.mjs', command: 'npm start', productionStatic: true,
    checks, port, listener: finalListener, idleSeconds: 30, observationMs: Date.now() - startedAt,
    npmPid: launched.child.pid, cleanup: '验证完成后仅停止测试启动的进程'
  }, null, 2));
  console.log(`启动验收通过：${checks.length} 项；3001 持续 LISTENING，空闲 30 秒后进程和 HTTP 均正常。`);
} catch (error) {
  await writeFile(new URL('../artifacts/startup-results.json', import.meta.url), JSON.stringify({ passed: false, checks, error: error.message, children: childRecords.map(record => ({pid:record.child.pid,stdout:record.stdout,stderr:record.stderr,ended:record.ended,code:record.code})) }, null, 2));
  throw error;
} finally {
  // 此清理仅属于验证脚本，不是 npm start 入口，也不会被生产服务导入。
  await stopOwnedProcess();
}
