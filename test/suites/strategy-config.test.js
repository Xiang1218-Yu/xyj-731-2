/**
 * 策略配置缺失校验单元测试
 *
 * 验证本次修复：OAuth2AuthStrategy / LdapAuthStrategy 在配置缺失时，
 * 不再因非空断言（!）而产生晦涩的 undefined 错误，而是抛出
 * InternalServerErrorException（500）并明确指出缺失的配置键名。
 *
 * 该测试直接实例化编译后的策略类，传入返回空值的 mock ConfigService，
 * 无需启动 Nest 应用、无需真实 OAuth2/LDAP 服务器。
 */
const {
  OAuth2AuthStrategy,
} = require('../../dist/auth/strategies/oauth2-auth.strategy');
const {
  LdapAuthStrategy,
} = require('../../dist/auth/strategies/ldap-auth.strategy');
const { InternalServerErrorException } = require('@nestjs/common');
const {
  ErrorMessage,
  formatErrorMessage,
} = require('../../dist/common/constants/error-messages');
const { assert } = require('../helpers/assert');

/** 构造一个所有配置项都返回空串的 ConfigService mock */
function createEmptyConfig() {
  return { get: () => '' };
}

async function run() {
  console.log('\n[策略配置缺失校验 - 单元测试]');

  // ============ OAuth2 ============
  const oauth2 = new OAuth2AuthStrategy(createEmptyConfig());

  // buildAuthorizeUrl 在配置缺失时应抛 500
  let oauth2Threw = false;
  try {
    oauth2.buildAuthorizeUrl();
  } catch (err) {
    oauth2Threw = true;
    assert(
      err instanceof InternalServerErrorException,
      'OAuth2 buildAuthorizeUrl 配置缺失抛 InternalServerErrorException(500)',
    );
    assert(
      typeof err.message === 'string' && err.message.includes('oauth2.authUrl'),
      `OAuth2 错误信息包含缺失的配置键名（实际: ${err.message}）`,
    );
    assert(
      err.message ===
        formatErrorMessage(ErrorMessage.OAUTH2_CONFIG_MISSING, 'oauth2.authUrl'),
      'OAuth2 配置缺失文案与枚举一致',
    );
  }
  assert(oauth2Threw, 'OAuth2 配置缺失确实抛出了异常');

  // authenticate 在配置缺失时（即便提供了 code）也应在换 token 前抛 500
  let oauth2AuthThrew = false;
  try {
    await oauth2.authenticate({ code: 'some-code' });
  } catch (err) {
    oauth2AuthThrew = true;
    assert(
      err instanceof InternalServerErrorException,
      'OAuth2 authenticate 配置缺失抛 500',
    );
    // tokenUrl 是 authenticate 中第一个读取的配置
    assert(
      err.message.includes('oauth2.tokenUrl'),
      'OAuth2 authenticate 错误指向 tokenUrl 配置',
    );
  }
  assert(oauth2AuthThrew, 'OAuth2 authenticate 配置缺失确实抛出了异常');

  // ============ LDAP ============
  const ldap = new LdapAuthStrategy(createEmptyConfig());

  // authenticate 在读取 url 时就应抛 500（在创建 LDAP 客户端之前）
  let ldapThrew = false;
  try {
    await ldap.authenticate({ username: 'someone', password: 'secret' });
  } catch (err) {
    ldapThrew = true;
    assert(
      err instanceof InternalServerErrorException,
      'LDAP 配置缺失抛 InternalServerErrorException(500)',
    );
    assert(
      typeof err.message === 'string' && err.message.includes('ldap.url'),
      `LDAP 错误信息包含缺失的配置键名（实际: ${err.message}）`,
    );
    assert(
      err.message ===
        formatErrorMessage(ErrorMessage.LDAP_CONFIG_MISSING, 'ldap.url'),
      'LDAP 配置缺失文案与枚举一致',
    );
  }
  assert(ldapThrew, 'LDAP 配置缺失确实抛出了异常');

  // ============ 配置齐全时不抛配置缺失错误 ============
  // OAuth2 配置齐全但授权服务器不可达，应抛 UnauthorizedException（而非配置错误）
  const fullConfig = {
    get: (key) =>
      ({
        'oauth2.authUrl': 'https://example.com/oauth/authorize',
        'oauth2.tokenUrl': 'https://invalid-host-for-test.invalid/oauth/token',
        'oauth2.userInfoUrl':
          'https://invalid-host-for-test.invalid/oauth/userinfo',
        'oauth2.clientId': 'id',
        'oauth2.clientSecret': 'secret',
        'oauth2.callbackUrl': 'http://localhost/cb',
      })[key],
  };
  const oauth2Full = new OAuth2AuthStrategy(fullConfig);
  let connectivityThrew = false;
  try {
    await oauth2Full.authenticate({ code: 'some-code' });
  } catch (err) {
    connectivityThrew = true;
    assert(
      err.status === 401,
      `配置齐全但服务器不可达时抛 401（实际状态: ${err.status}）`,
    );
    assert(
      err.message === ErrorMessage.OAUTH2_TOKEN_FETCH_FAILED,
      '服务器不可达错误文案使用枚举',
    );
  }
  assert(connectivityThrew, 'OAuth2 网络不可达确实抛出了异常');
}

module.exports = { run };
