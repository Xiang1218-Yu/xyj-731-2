/**
 * 测试脚本 04: LDAP 认证策略
 * 运行: node test/scripts/04-ldap.test.js
 *
 * 由于示例环境无真实 LDAP 服务器，连接失败时会回退本地用户库。
 */
const { post, get, assert, assertEqual } = require('./_client');

async function run() {
  console.log('\n▶ [04] LDAP 认证策略');

  // 1. LDAP 登录（无真实服务器时本地回退）
  const login = await post('/api/auth/login', {
    authType: 'ldap',
    username: 'viewer',
    password: '123456',
  });
  assertEqual(login.status, 201, 'LDAP 登录应返回 201');
  assert(login.body.accessToken, '应返回 accessToken');
  assertEqual(login.body.user.authType, 'ldap', 'authType 应为 ldap');
  assertEqual(login.body.user.username, 'viewer', '用户名应为 viewer');
  console.log('  ✅ LDAP 认证成功(本地回退), 用户:', login.body.user.username);

  // 2. 错误密码应 401
  const bad = await post('/api/auth/login', {
    authType: 'ldap',
    username: 'viewer',
    password: 'wrong-pass',
  });
  assertEqual(bad.status, 401, '错误密码应返回 401');
  console.log('  ✅ 错误密码正确拒绝 (401)');

  // 3. 缺失用户名密码应 401
  const missing = await post('/api/auth/login', { authType: 'ldap' });
  assertEqual(missing.status, 401, '缺失凭证应返回 401');
  console.log('  ✅ 缺失凭证正确拒绝 (401)');

  // 4. 认证类型列表包含 ldap
  const types = await get('/api/auth/types');
  assert(types.body.types.includes('ldap'), '认证类型列表应包含 ldap');
  console.log('  ✅ 认证类型列表包含 ldap');

  console.log('  🎉 [04] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
