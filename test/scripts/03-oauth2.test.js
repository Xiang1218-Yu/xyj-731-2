/**
 * 测试脚本 03: OAuth2.0 认证策略
 * 运行: node test/scripts/03-oauth2.test.js
 *
 * 由于示例环境无真实 OAuth2 服务器，外部服务不可用时会回退本地用户库。
 */
const { post, get, assert, assertEqual } = require('./_client');

async function run() {
  console.log('\n▶ [03] OAuth2.0 认证策略');

  // 1. 获取授权地址
  const authorize = await get('/api/auth/oauth2/authorize?state=xyz123');
  assertEqual(authorize.status, 200, '获取授权地址应 200');
  assert(
    authorize.body.authorizeUrl.includes('response_type=code'),
    '授权地址应包含 response_type=code',
  );
  assert(
    authorize.body.authorizeUrl.includes('state=xyz123'),
    '授权地址应包含 state',
  );
  console.log('  ✅ 生成 OAuth2 授权地址成功');

  // 2. 使用用户名密码（密码模式/本地回退）登录
  const login = await post('/api/auth/login', {
    authType: 'oauth2',
    username: 'editor',
    password: '123456',
  });
  assertEqual(login.status, 201, 'OAuth2 登录应返回 201');
  assert(login.body.accessToken, '应返回 accessToken');
  assertEqual(login.body.user.authType, 'oauth2', 'authType 应为 oauth2');
  assertEqual(login.body.user.username, 'editor', '用户名应为 editor');
  console.log('  ✅ OAuth2 认证成功(本地回退), 用户:', login.body.user.username);

  // 3. 错误密码应 401（使用满足最小长度但错误的密码，以通过 DTO 校验到达策略层）
  const bad = await post('/api/auth/login', {
    authType: 'oauth2',
    username: 'editor',
    password: 'wrongpass',
  });
  assertEqual(bad.status, 401, '错误密码应返回 401');
  console.log('  ✅ 错误凭证正确拒绝 (401)');

  // 4. 获取支持的认证类型包含 oauth2
  const types = await get('/api/auth/types');
  assert(
    types.body.types.includes('oauth2'),
    '认证类型列表应包含 oauth2',
  );
  console.log('  ✅ 认证类型列表包含 oauth2');

  console.log('  🎉 [03] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
