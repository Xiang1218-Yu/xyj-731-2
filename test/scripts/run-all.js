/**
 * 测试脚本统一运行器
 *
 * 功能:
 *  1. 构建项目 (npm run build);
 *  2. 启动编译后的服务 (node dist/main.js);
 *  3. 等待健康检查通过;
 *  4. 依次运行所有 test/scripts/*.test.js 脚本;
 *  5. 汇总结果并关闭服务。
 *
 * 也可在服务已运行时直接执行: BASE_URL=http://localhost:3000 node test/scripts/01-health.test.js
 *
 * 运行: npm run test:scripts
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.PORT || '3000';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const TEST_FILES = [
  '01-health.test.js',
  '02-jwt.test.js',
  '03-oauth2.test.js',
  '04-ldap.test.js',
  '05-permissions.test.js',
  '06-refresh-logout.test.js',
];

/** 执行命令并返回 Promise */
function runCmd(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`));
    });
    child.on('error', reject);
  });
}

/** 等待服务健康检查通过 */
async function waitForHealth(maxRetries = 30) {
  const url = `${BASE_URL}/api/health`;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        return body;
      }
    } catch {
      // 服务尚未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`服务在 ${maxRetries} 秒内未就绪: ${url}`);
}

/** 运行单个测试脚本 */
function runTestFile(file) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(__dirname, file)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, BASE_URL },
    });
    child.on('close', (code) => {
      resolve({ file, code });
    });
  });
}

async function main() {
  let serverProcess = null;
  let startedByRunner = false;

  console.log('========================================');
  console.log('  统一身份认证服务 - Node.js 接口测试');
  console.log('========================================');

  try {
    // 1. 检查服务是否已在运行
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log(`\n检测到服务已运行: ${BASE_URL}，直接执行测试。\n`);
      } else {
        throw new Error('服务未就绪');
      }
    } catch {
      // 服务未运行，需要构建并启动
      console.log('\n未检测到运行中的服务，开始构建...');
      await runCmd('npm', ['run', 'build']);
      console.log('构建完成，启动服务...');

      serverProcess = spawn('node', ['dist/main.js'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT },
      });

      // 输出服务日志到控制台（带前缀）
      serverProcess.stdout.on('data', (d) => {
        process.stdout.write(`[server] ${d}`);
      });
      serverProcess.stderr.on('data', (d) => {
        process.stderr.write(`[server] ${d}`);
      });

      startedByRunner = true;
      console.log('等待服务就绪...');
      const health = await waitForHealth();
      console.log(
        `服务已就绪 (会话存储: ${health.sessionStore})，开始执行测试...\n`,
      );
    }

    // 2. 依次运行测试脚本
    const results = [];
    for (const file of TEST_FILES) {
      const result = await runTestFile(file);
      results.push(result);
    }

    // 3. 汇总结果
    console.log('========================================');
    console.log('  测试结果汇总');
    console.log('========================================');
    let passed = 0;
    let failed = 0;
    for (const r of results) {
      if (r.code === 0) {
        console.log(`  ✅ ${r.file}`);
        passed++;
      } else {
        console.log(`  ❌ ${r.file} (退出码 ${r.code})`);
        failed++;
      }
    }
    console.log('----------------------------------------');
    console.log(`  通过: ${passed} / ${results.length}，失败: ${failed}`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n💥 测试运行失败:', err.message);
    process.exit(1);
  } finally {
    // 4. 如果是本脚本启动的服务，关闭它
    if (startedByRunner && serverProcess) {
      console.log('关闭测试服务...');
      serverProcess.kill('SIGTERM');
    }
  }
}

main();
