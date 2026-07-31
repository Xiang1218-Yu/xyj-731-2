/**
 * 测试运行器
 *
 * 使用方式：
 *   1. 先启动服务：npm run build && npm run start:prod（或 npm run start:dev）
 *   2. 在另一个终端运行：npm test
 *
 * 测试使用 Node.js 原生 fetch，无第三方测试框架依赖。
 * 可通过环境变量 TEST_BASE_URL 指定被测服务地址。
 */
const { summary } = require('./helpers/assert');

const suites = [
  require('./suites/jwt-auth.test'),
  require('./suites/strategy-switch.test'),
  require('./suites/external-strategy.test'),
  require('./suites/swagger.test'),
];

async function waitForServer(maxRetries = 10) {
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000/api';
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${base}/auth/strategy`);
      if (resp.ok) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

async function main() {
  console.log('=== 统一身份认证服务 接口测试 ===');
  console.log(
    `被测服务: ${process.env.TEST_BASE_URL || 'http://localhost:3000/api'}`,
  );

  const ready = await waitForServer();
  if (!ready) {
    console.error('\n无法连接到被测服务，请先启动服务（npm run start:prod）');
    process.exit(1);
  }

  for (const suite of suites) {
    try {
      await suite.run();
    } catch (err) {
      console.error(`测试套件执行异常: ${err.message}`);
      console.error(err.stack);
    }
  }

  const allPassed = summary();
  process.exit(allPassed ? 0 : 1);
}

main();
