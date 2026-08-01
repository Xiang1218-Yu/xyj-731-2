/**
 * 测试脚本 06: 令牌刷新与登出
 * 运行: node test/scripts/06-refresh-logout.test.js
 */
const { post, get, assert, assertEqual } = require('./_client');

async function run() {
  console.log('\n▶ [06] 令牌刷新与登出');

  // 1. 登录
  const login = await post('/api/auth/login', {
    authType: 'jwt',
    username: 'admin',
    password: '123456',
  });
  assertEqual(login.status, 201, '登录应 201');
  const { accessToken, refreshToken } = login.body;
  console.log('  ✅ 登录成功');

  // 2. 刷新令牌
  const refresh = await post('/api/auth/refresh', { refreshToken });
  assertEqual(refresh.status, 201, '刷新令牌应 201');
  assert(refresh.body.accessToken, '应返回新 accessToken');
  assert(refresh.body.refreshToken, '应返回新 refreshToken');
  assert(
    refresh.body.accessToken !== accessToken,
    '新 accessToken 应与旧的不同',
  );
  console.log('  ✅ 刷新令牌成功，获得新的令牌对');

  // 3. 新 accessToken 可正常访问受保护接口
  const profile = await get('/api/auth/profile', {
    token: refresh.body.accessToken,
  });
  assertEqual(profile.status, 200, '新 token 访问 profile 应 200');
  console.log('  ✅ 新 accessToken 可访问受保护接口');

  // 4. 无效 refreshToken 应 401
  const badRefresh = await post('/api/auth/refresh', {
    refreshToken: 'invalid.token.here',
  });
  assertEqual(badRefresh.status, 401, '无效 refreshToken 应 401');
  console.log('  ✅ 无效 refreshToken 被拒绝 (401)');

  // 5. 登出
  const logout = await post('/api/auth/logout', { refreshToken });
  assertEqual(logout.status, 201, '登出应 201');
  assertEqual(logout.body.success, true, '登出应返回 success=true');
  console.log('  ✅ 登出成功');

  // 6. 登出后使用原 refreshToken 应失败（会话已销毁）
  const afterLogout = await post('/api/auth/refresh', { refreshToken });
  assertEqual(afterLogout.status, 401, '登出后 refreshToken 应失效');
  console.log('  ✅ 登出后 refreshToken 已失效 (401)');

  // 7. 登出不存在的 token 应 401
  const logoutAgain = await post('/api/auth/logout', {
    refreshToken: 'invalid.token.here',
  });
  assertEqual(logoutAgain.status, 401, '登出无效 token 应 401');
  console.log('  ✅ 登出无效 token 被拒绝 (401)');

  console.log('  🎉 [06] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
