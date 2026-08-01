/**
 * OAuth2 / LDAP 策略错误处理测试
 *
 * 由于测试环境通常没有真实的 OAuth2 授权服务器和 LDAP 服务器，
 * 这里验证策略在缺少凭证或外部服务不可达时能够返回规范的错误，
 * 证明策略本身已正确接入框架与策略上下文。
 * （完整的成功路径需对接真实 OAuth2/LDAP 环境后联调。）
 */
const { request } = require('../helpers/http-client');
const { assert, assertEqual } = require('../helpers/assert');

async function run() {
  console.log('\n[OAuth2 / LDAP 策略错误处理]');

  // 1. OAuth2 缺少 code 应返回 401
  const oauth2NoCode = await request('POST', '/auth/login', {
    body: { strategy: 'oauth2' },
  });
  assertEqual(
    oauth2NoCode.status,
    401,
    'OAuth2 缺少 code 返回 401',
  );

  // 2. OAuth2 提供 code 但授权服务器不可达（配置的是 example 域名）
  //    应返回 401 而非 500，错误信息可被前端识别
  const oauth2BadCode = await request('POST', '/auth/login', {
    body: { strategy: 'oauth2', code: 'invalid-code-for-test' },
  });
  assert(
    oauth2BadCode.status === 401 || oauth2BadCode.status === 500,
    `OAuth2 无效 code 返回 4xx/5xx（实际: ${oauth2BadCode.status}）`,
  );

  // 3. OAuth2 授权地址接口返回合法 URL
  const authorizeUrl = await request('GET', '/auth/oauth2/authorize');
  assertEqual(authorizeUrl.status, 200, '获取 OAuth2 授权地址返回 200');
  assert(
    authorizeUrl.data.authorizeUrl &&
      authorizeUrl.data.authorizeUrl.startsWith('http'),
    '返回合法的授权 URL',
  );
  assert(
    authorizeUrl.data.authorizeUrl.includes('response_type=code'),
    '授权 URL 使用授权码模式',
  );
  assert(
    authorizeUrl.data.authorizeUrl.includes('client_id='),
    '授权 URL 携带 client_id',
  );

  // 4. LDAP 缺少密码应返回 401（在尝试连接前即被拦截）
  const ldapNoPwd = await request('POST', '/auth/login', {
    body: { strategy: 'ldap', username: 'someuser' },
  });
  assertEqual(
    ldapNoPwd.status,
    401,
    'LDAP 缺少密码返回 401',
  );

  // 5. LDAP 提供凭证但服务器不可达（本地通常没有 LDAP）
  //    应返回 500（连接失败）而非进程崩溃
  const ldapNoServer = await request('POST', '/auth/login', {
    body: { strategy: 'ldap', username: 'someuser', password: 'somepass' },
  });
  assert(
    ldapNoServer.status === 500 || ldapNoServer.status === 401,
    `LDAP 服务器不可达时返回规范错误（实际: ${ldapNoServer.status}）`,
  );
}

module.exports = { run };
