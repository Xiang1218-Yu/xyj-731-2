/**
 * 策略动态切换测试
 *
 * 覆盖：
 *  - 查询当前策略
 *  - 单次请求通过 strategy 字段指定策略（覆盖全局默认）
 *  - 管理员运行时切换全局默认策略
 *  - 切换后不传 strategy 的登录请求走新策略
 *  - 非管理员无法切换策略
 *  - 切换到不支持的策略被拒绝
 *  - 测试结束后恢复默认策略
 */
const { request } = require('../helpers/http-client');
const { assert, assertEqual } = require('../helpers/assert');

async function run() {
  console.log('\n[策略模式与动态切换]');

  // 先用 admin 登录拿到 token
  const adminLogin = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminLogin.data.tokens.accessToken;

  // 1. 查询当前策略
  const getStrategy = await request('GET', '/auth/strategy');
  assertEqual(getStrategy.status, 200, '查询策略返回 200');
  assertEqual(getStrategy.data.current, 'jwt', '初始默认策略为 jwt');
  assert(
    Array.isArray(getStrategy.data.available) &&
      getStrategy.data.available.length === 3,
    '可用策略包含 3 种（jwt/oauth2/ldap）',
  );

  // 2. 单次请求显式指定策略（不影响全局默认）
  const explicitJwt = await request('POST', '/auth/login', {
    body: { username: 'user', password: 'user123', strategy: 'jwt' },
  });
  assertEqual(
    explicitJwt.data.principal.strategy,
    'jwt',
    '显式指定 jwt 策略登录成功',
  );

  // 3. 指定不存在的策略
  const invalidStrategy = await request('POST', '/auth/login', {
    body: { username: 'user', password: 'user123', strategy: 'nonexist' },
  });
  // DTO 校验会拒绝非法枚举值
  assert(
    invalidStrategy.status === 400,
    '非法策略被 DTO 校验拒绝（400）',
  );

  // 4. 非管理员切换策略被拒绝
  const userLogin = await request('POST', '/auth/login', {
    body: { username: 'user', password: 'user123' },
  });
  const userToken = userLogin.data.tokens.accessToken;
  const userSwitch = await request('POST', '/auth/strategy', {
    token: userToken,
    body: { strategy: 'ldap' },
  });
  assertEqual(userSwitch.status, 403, '普通用户切换策略返回 403');

  // 5. 管理员切换全局默认策略到 oauth2
  const switchToOauth2 = await request('POST', '/auth/strategy', {
    token: adminToken,
    body: { strategy: 'oauth2' },
  });
  assertEqual(switchToOauth2.status, 200, '管理员切换策略到 oauth2 返回 200');
  assertEqual(switchToOauth2.data.current, 'oauth2', '当前策略已变为 oauth2');

  // 6. 切换后不传 strategy 的登录应走 oauth2（缺少 code 应返回 401）
  const defaultOauth2 = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  assertEqual(
    defaultOauth2.status,
    401,
    '默认策略切换为 oauth2 后，缺少 code 的登录被拒绝',
  );
  assert(
    JSON.stringify(defaultOauth2.data).includes('code'),
    '错误信息提示需要 code',
  );

  // 7. 单次请求仍可显式指定 jwt 覆盖全局默认（策略模式灵活切换）
  const overrideToJwt = await request('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123', strategy: 'jwt' },
  });
  assertEqual(
    overrideToJwt.status,
    200,
    '显式指定 jwt 可覆盖全局默认的 oauth2',
  );
  assertEqual(
    overrideToJwt.data.principal.strategy,
    'jwt',
    '实际使用 jwt 策略',
  );

  // 8. 切换到 ldap，验证默认策略生效（无 LDAP 服务器会连接失败 500 或认证失败）
  const switchToLdap = await request('POST', '/auth/strategy', {
    token: adminToken,
    body: { strategy: 'ldap' },
  });
  assertEqual(switchToLdap.status, 200, '管理员切换策略到 ldap 返回 200');
  assertEqual(switchToLdap.data.current, 'ldap', '当前策略已变为 ldap');

  // 9. 无 token 无法切换策略
  const noAuthSwitch = await request('POST', '/auth/strategy', {
    body: { strategy: 'jwt' },
  });
  assertEqual(noAuthSwitch.status, 401, '未登录切换策略返回 401');

  // 10. 恢复默认策略为 jwt
  const restore = await request('POST', '/auth/strategy', {
    token: adminToken,
    body: { strategy: 'jwt' },
  });
  assertEqual(restore.data.current, 'jwt', '测试结束恢复默认策略为 jwt');
}

module.exports = { run };
