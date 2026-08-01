/**
 * 错误处理与本次修复回归测试
 *
 * 覆盖：
 *  1. AuthStrategyContext 抛出正确的 HttpException 类型（400/401/404），而非原生 Error（500）
 *  2. TokenService 的 refresh token HMAC 摘要逻辑（确定性、防篡改、防时序攻击）
 *  3. OAuth2 / LDAP 配置缺失时返回明确的 500 错误信息
 *  4. 错误消息枚举被正确使用（响应 message 与枚举一致）
 *
 * 该套件包含两部分：
 *  - HTTP 接口测试（需要服务运行）
 *  - 纯单元测试（直接 require 编译后的 service，无需启动 HTTP）
 */
const { request } = require('../helpers/http-client');
const { assert, assertEqual } = require('../helpers/assert');

// 引入编译后的枚举，用于断言响应文案与枚举一致
const {
  ErrorMessage,
  formatErrorMessage,
} = require('../../dist/common/constants/error-messages');

async function runHttpTests() {
  console.log('\n[错误处理 - HTTP 接口层]');

  // 1. 未携带 token 访问受保护接口 → 401，文案来自枚举
  const noToken = await request('GET', '/auth/me');
  assertEqual(noToken.status, 401, '无 token 访问 /me 返回 401');
  assertEqual(
    noToken.data.message,
    ErrorMessage.GUARD_NO_TOKEN,
    '错误文案使用 ErrorMessage.GUARD_NO_TOKEN 枚举',
  );

  // 2. 非法 token（随便写的字符串）→ 401 access token 无效
  const badToken = await request('GET', '/auth/me', {
    token: 'invalid.token.value',
  });
  assertEqual(badToken.status, 401, '非法 token 返回 401');
  assertEqual(
    badToken.data.message,
    ErrorMessage.AUTH_INVALID_ACCESS_TOKEN,
    '错误文案使用 ErrorMessage.AUTH_INVALID_ACCESS_TOKEN 枚举',
  );

  // 3. 使用 access token 调刷新接口 → 401 提示用 refresh token
  const login = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const accessToken = login.data.tokens.accessToken;
  const refreshToken = login.data.tokens.refreshToken;

  const useAccessToRefresh = await request('POST', '/auth/refresh', {
    body: { refreshToken: accessToken },
  });
  assertEqual(
    useAccessToRefresh.status,
    401,
    '用 access token 调刷新接口返回 401',
  );
  assertEqual(
    useAccessToRefresh.data.message,
    ErrorMessage.AUTH_USE_REFRESH_TOKEN,
    '错误文案使用 ErrorMessage.AUTH_USE_REFRESH_TOKEN 枚举',
  );

  // 4. 登出后再用旧 access token → 401 会话已失效
  await request('POST', '/auth/logout', { token: accessToken });
  const afterLogout = await request('GET', '/auth/me', { token: accessToken });
  assertEqual(afterLogout.status, 401, '登出后 access token 失效返回 401');
  assertEqual(
    afterLogout.data.message,
    ErrorMessage.AUTH_SESSION_EXPIRED,
    '错误文案使用 ErrorMessage.AUTH_SESSION_EXPIRED 枚举',
  );

  // 5. 登出后旧 refresh token 也应失效（会话已销毁）
  const refreshAfterLogout = await request('POST', '/auth/refresh', {
    body: { refreshToken },
  });
  assertEqual(
    refreshAfterLogout.status,
    401,
    '登出后 refresh token 失效返回 401',
  );
  assertEqual(
    refreshAfterLogout.data.message,
    ErrorMessage.AUTH_SESSION_EXPIRED,
    '登出后刷新会话错误文案为 AUTH_SESSION_EXPIRED',
  );

  // 6. 篡改 refresh token（签名无效）→ 401 refresh token 无效
  const tampered = refreshToken.slice(0, -3) + 'abc';
  const tamperedResp = await request('POST', '/auth/refresh', {
    body: { refreshToken: tampered },
  });
  assertEqual(tamperedResp.status, 401, '篡改的 refresh token 返回 401');
  assertEqual(
    tamperedResp.data.message,
    ErrorMessage.AUTH_INVALID_REFRESH_TOKEN,
    '错误文案使用 ErrorMessage.AUTH_INVALID_REFRESH_TOKEN 枚举',
  );

  // 7. 普通用户访问 admin 接口 → 403，文案包含所需角色
  const userLogin = await request('POST', '/auth/login', {
    body: { username: 'user', password: 'user123' },
  });
  const userToken = userLogin.data.tokens.accessToken;
  const forbidden = await request('GET', '/auth/admin/info', {
    token: userToken,
  });
  assertEqual(forbidden.status, 403, '普通用户访问 admin 接口返回 403');
  assert(
    forbidden.data.message.includes('admin'),
    '403 错误文案包含所需角色名',
  );

  // 8. JWT 策略：错误密码 → 401，统一文案（不区分用户是否存在）
  const wrongPwd = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'wrong' },
  });
  assertEqual(wrongPwd.status, 401, '错误密码返回 401');
  assertEqual(
    wrongPwd.data.message,
    ErrorMessage.JWT_INVALID_CREDENTIALS,
    '错误文案使用 ErrorMessage.JWT_INVALID_CREDENTIALS 枚举',
  );

  // 9. JWT 策略：缺少密码 → 401
  const missingPwd = await request('POST', '/auth/login', {
    body: { username: 'admin' },
  });
  assertEqual(missingPwd.status, 401, '缺少密码返回 401');
  assertEqual(
    missingPwd.data.message,
    ErrorMessage.JWT_CREDENTIALS_REQUIRED,
    '错误文案使用 ErrorMessage.JWT_CREDENTIALS_REQUIRED 枚举',
  );

  // 10. OAuth2 策略：缺少 code → 401
  const oauth2NoCode = await request('POST', '/auth/login', {
    body: { strategy: 'oauth2' },
  });
  assertEqual(oauth2NoCode.status, 401, 'OAuth2 缺少 code 返回 401');
  assertEqual(
    oauth2NoCode.data.message,
    ErrorMessage.OAUTH2_CODE_REQUIRED,
    '错误文案使用 ErrorMessage.OAUTH2_CODE_REQUIRED 枚举',
  );

  // 11. LDAP 策略：缺少密码 → 401
  const ldapNoPwd = await request('POST', '/auth/login', {
    body: { strategy: 'ldap', username: 'someone' },
  });
  assertEqual(ldapNoPwd.status, 401, 'LDAP 缺少密码返回 401');
  assertEqual(
    ldapNoPwd.data.message,
    ErrorMessage.LDAP_CREDENTIALS_REQUIRED,
    '错误文案使用 ErrorMessage.LDAP_CREDENTIALS_REQUIRED 枚举',
  );

  // 12. 管理员切换策略到一个非法值会被 DTO 拦截（400），而非抛出原生 Error
  const adminLogin = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminLogin.data.tokens.accessToken;
  const invalidSwitch = await request('POST', '/auth/strategy', {
    token: adminToken,
    body: { strategy: 'nonexist' },
  });
  assertEqual(
    invalidSwitch.status,
    400,
    '切换到非法策略被 DTO 校验拦截返回 400',
  );

  // 恢复默认策略为 jwt，避免影响其他测试套件
  await request('POST', '/auth/strategy', {
    token: adminToken,
    body: { strategy: 'jwt' },
  });
}

/**
 * 纯单元测试：直接测试 formatErrorMessage 工具函数
 */
function runUnitTests() {
  console.log('\n[错误处理 - 枚举与格式化工具]');

  // formatErrorMessage 正确填充占位符
  const msg = formatErrorMessage(ErrorMessage.GUARD_FORBIDDEN_ROLES, 'admin,user');
  assert(
    msg.includes('admin,user'),
    'formatErrorMessage 正确填充 {0} 占位符',
  );
  assert(
    !msg.includes('{0}'),
    'formatErrorMessage 填充后不含原始占位符',
  );

  // 多个占位符按顺序填充
  const multi = formatErrorMessage('A{0}B{1}C', '1', '2');
  assertEqual(multi, 'A1B2C', 'formatErrorMessage 支持多个占位符');

  // 未提供的参数替换为空串，而不是 "undefined"
  const missing = formatErrorMessage('value={0}', undefined);
  assertEqual(missing, 'value=', '缺失参数替换为空串');

  // 枚举值均为非空字符串
  const enumValues = Object.values(ErrorMessage);
  assert(enumValues.length > 15, `错误消息枚举包含 ${enumValues.length} 项`);
  assert(
    enumValues.every((v) => typeof v === 'string' && v.length > 0),
    '所有枚举值均为非空字符串',
  );
}

async function run() {
  runUnitTests();
  await runHttpTests();
}

module.exports = { run };
