/**
 * 测试脚本 01: 健康检查
 * 运行: node test/scripts/01-health.test.js
 */
const { get, assert, assertEqual, BASE_URL } = require('./_client');

async function run() {
  console.log(`\n▶ [01] 健康检查 (${BASE_URL})`);

  const res = await get('/api/health');
  assertEqual(res.status, 200, '健康检查应返回 200');
  assertEqual(res.body.status, 'ok', 'status 应为 ok');
  assert(
    ['redis', 'memory'].includes(res.body.sessionStore),
    `sessionStore 应为 redis 或 memory，实际: ${res.body.sessionStore}`,
  );

  console.log('  ✅ 服务状态:', res.body.status);
  console.log('  ✅ 会话存储:', res.body.sessionStore);
  console.log('  ✅ 运行时长:', Math.round(res.body.uptime), '秒');
  console.log('  🎉 [01] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
