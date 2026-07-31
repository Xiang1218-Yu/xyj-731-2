/**
 * 测试脚本 02: JWT 认证策略
 * 运行: node test/scripts/02-jwt.test.js
 */
const { post, get, assert, assertEqual } = require('./_client');

async function run() {
  console.log('\n▶ [02] JWT 认证策略');

  // 1. 正确账号密码登录
  const login = await post('/api/auth/login', {
    authType: 'jwt',
    username: 'admin',
    password: '123456',
  });
  assertEqual(login.status, 201, 'JWT 登录应返回 201');
  assert(login.body.accessToken, '应返回 accessToken');
  assert(login.body.refreshToken, '应返回 refreshToken');
  assertEqual(login.body.tokenType, 'Bearer', 'tokenType 应为 Bearer');
  assertEqual(login.body.user.username, 'admin', '用户名应为 admin');
  assert(
    login.body.user.roles.includes('admin'),
    'admin 用户应包含 admin 角色',
  );
  console.log('  ✅ 正确账号密码登录成功, 用户:', login.body.user.username);

  // 2. 错误密码应 401
  const bad = await post('/api/auth/login', {
    authType: 'jwt',
    username: 'admin',
    password: 'wrong-pass',
  });
  assertEqual(bad.status, 401, '错误密码应返回 401');
  console.log('  ✅ 错误密码正确拒绝 (401)');

  // 3. 不存在用户应 401
  const noUser = await post('/api/auth/login', {
    authType: 'jwt',
    username: 'nobody',
    password: '123456',
  });
  assertEqual(noUser.status, 401, '不存在用户应返回 401');
  console.log('  ✅ 不存在用户正确拒绝 (401)');

  // 4. 使用 accessToken 访问受保护接口
  const profile = await get('/api/auth/profile', {
    token: login.body.accessToken,
  });
  assertEqual(profile.status, 200, '携带 token 访问 profile 应 200');
  assertEqual(profile.body.username, 'admin', 'profile 用户应为 admin');
  console.log('  ✅ accessToken 访问受保护接口成功');

  // 5. 不携带 token 应 401
  const noToken = await get('/api/auth/profile');
  assertEqual(noToken.status, 401, '未携带 token 应返回 401');
  console.log('  ✅ 未携带 token 正确拒绝 (401)');

  // 导出登录结果供后续脚本使用（通过全局缓存）
  module.exports = { login: login.body };
  console.log('  🎉 [02] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
