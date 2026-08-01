/**
 * JWT 策略认证流程测试
 *
 * 覆盖：
 *  - 使用 JWT 策略登录（admin / user）
 *  - 错误密码被拒绝
 *  - 获取当前用户信息
 *  - 访问受保护资源
 *  - 刷新令牌
 *  - 登出后令牌失效
 */
const { request } = require('../helpers/http-client');
const { assert, assertEqual } = require('../helpers/assert');

async function run() {
  console.log('\n[JWT 策略认证流程]');

  // 1. 管理员登录
  const adminLogin = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  assertEqual(adminLogin.status, 200, '管理员登录返回 200');
  assert(adminLogin.data.principal, '返回用户主体');
  assertEqual(adminLogin.data.principal.username, 'admin', '用户名为 admin');
  assert(
    adminLogin.data.principal.roles.includes('admin'),
    'admin 用户拥有 admin 角色',
  );
  assertEqual(
    adminLogin.data.principal.strategy,
    'jwt',
    '认证策略为 jwt',
  );
  assert(adminLogin.data.tokens.accessToken, '返回 accessToken');
  assert(adminLogin.data.tokens.refreshToken, '返回 refreshToken');
  assertEqual(adminLogin.data.tokens.tokenType, 'Bearer', '令牌类型为 Bearer');

  const adminToken = adminLogin.data.tokens.accessToken;
  const adminRefresh = adminLogin.data.tokens.refreshToken;

  // 2. 普通用户登录
  const userLogin = await request('POST', '/auth/login', {
    body: { username: 'user', password: 'user123' },
  });
  assertEqual(userLogin.status, 200, '普通用户登录返回 200');
  assert(
    !userLogin.data.principal.roles.includes('admin'),
    '普通用户不含 admin 角色',
  );
  const userToken = userLogin.data.tokens.accessToken;

  // 3. 错误密码被拒绝
  const badLogin = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'wrong' },
  });
  assertEqual(badLogin.status, 401, '错误密码返回 401');

  // 4. 缺少凭证被拒绝
  const emptyLogin = await request('POST', '/auth/login', { body: {} });
  assertEqual(emptyLogin.status, 401, '缺少凭证返回 401');

  // 5. 获取当前用户信息
  const me = await request('GET', '/auth/me', { token: adminToken });
  assertEqual(me.status, 200, 'GET /me 返回 200');
  assertEqual(me.data.username, 'admin', '/me 返回当前用户 admin');
  assert(me.data.sessionId, '/me 返回 sessionId');

  // 6. 无 token 访问受保护接口被拒绝
  const noAuth = await request('GET', '/auth/me');
  assertEqual(noAuth.status, 401, '无 token 访问 /me 返回 401');

  // 7. 刷新令牌
  const refresh = await request('POST', '/auth/refresh', {
    body: { refreshToken: adminRefresh },
  });
  assertEqual(refresh.status, 200, '刷新令牌返回 200');
  assert(
    refresh.data.tokens.accessToken !== adminToken,
    '刷新后得到新的 accessToken',
  );
  assert(
    refresh.data.tokens.refreshToken !== adminRefresh,
    'refresh token rotation 生效',
  );
  const newAdminToken = refresh.data.tokens.accessToken;

  // 8. 旧 refresh token 已失效（rotation 后不能再次使用）
  const replayRefresh = await request('POST', '/auth/refresh', {
    body: { refreshToken: adminRefresh },
  });
  assertEqual(
    replayRefresh.status,
    401,
    '旧 refresh token 重用被拒绝（rotation 生效）',
  );

  // 9. 普通用户访问 admin 接口被拒绝（RBAC）
  const userForbidden = await request('GET', '/auth/admin/info', {
    token: userToken,
  });
  assertEqual(
    userForbidden.status,
    403,
    '普通用户访问 admin 接口返回 403',
  );

  // 10. 管理员访问 admin 接口成功
  const adminOk = await request('GET', '/auth/admin/info', {
    token: newAdminToken,
  });
  assertEqual(adminOk.status, 200, '管理员访问 admin 接口返回 200');

  // 11. 登出
  const logout = await request('POST', '/auth/logout', {
    token: newAdminToken,
  });
  assertEqual(logout.status, 200, '登出返回 200');

  // 12. 登出后 access token 已失效（会话已销毁）
  const afterLogout = await request('GET', '/auth/me', {
    token: newAdminToken,
  });
  assertEqual(afterLogout.status, 401, '登出后 access token 失效返回 401');
}

module.exports = { run };
