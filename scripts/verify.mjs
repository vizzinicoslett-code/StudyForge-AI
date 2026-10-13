import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
const run=promisify(execFile);
try {
  const {stdout,stderr}=await run(process.execPath,['--test','--test-reporter=tap','tests/app.test.mjs','tests/mock-summary.test.mjs'],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});
  await writeFile(new URL('../artifacts/api-tests.tap',import.meta.url),stdout+stderr);
  const passed=Number(stdout.match(/# pass (\d+)/)?.[1]||0),failed=Number(stdout.match(/# fail (\d+)/)?.[1]||0);
  if(!passed||failed)throw new Error('测试报告包含失败项');
  await writeFile(new URL('../artifacts/api-results.json',import.meta.url),JSON.stringify({passed:true,tests:passed,failed,transport:'real local HTTP',remoteModelTested:false,node:process.version},null,2));
  console.log(`正式后台测试证据已保存：${passed} 组通过，${failed} 组失败。`);
} catch(error){await writeFile(new URL('../artifacts/api-results.json',import.meta.url),JSON.stringify({passed:false,error:error.message},null,2));throw error;}
