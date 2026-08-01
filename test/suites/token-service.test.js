/**
 * TokenService 单元测试
 *
 * 重点验证本次从 bcrypt 切换为 HMAC-SHA256 的优化：
 *  1. hashRefreshToken 为同步方法，且对相同输入产出确定性的 64 位 hex 摘要
 *  2. compareRefreshToken 能正确匹配，且对篡改 token 返回 false
 *  3. 不同密钥产出不同摘要（密钥隔离）
 *  4. 性能：HMAC 应远快于 bcrypt（断言单次 < 5ms，bcrypt 通常需几十~上百 ms）
 *  5. issueTokens / verifyToken 端到端流程正常，并区分 access/refresh 类型
 *
 * 该测试直接实例化编译后的 TokenService，使用真实 JwtService + mock ConfigService，
 * 无需启动整个 Nest 应用。
 */
const { JwtService } = require('@nestjs/jwt');
const {
  TokenService,
} = require('../../dist/auth/services/token.service');
const { assert } = require('../helpers/assert');

function createTokenService(secret = 'unit-test-secret') {
  const jwt = new JwtService({});
  const config = {
    get: (key) => {
      const map = {
        'jwt.secret': secret,
        'jwt.expiresIn': 3600,
        'jwt.refreshExpiresIn': 604800,
      };
      return map[key];
    },
  };
  return new TokenService(jwt, config);
}

function run() {
  console.log('\n[TokenService - HMAC 摘要与令牌签发]');

  const service = createTokenService();

  // 1. HMAC 摘要确定性：相同 token 产出相同摘要
  const token = 'eyJhbGciOiJIUzI1NiJ9.test.refresh.token';
  const hash1 = service.hashRefreshToken(token);
  const hash2 = service.hashRefreshToken(token);
  assert(hash1 === hash2, '相同 token 的 HMAC 摘要一致');

  // 2. 摘要为 64 字符的 hex（SHA256 输出 32 字节）
  assert(/^[0-9a-f]{64}$/.test(hash1), '摘要为 64 位 hex 字符串（SHA256）');

  // 3. compareRefreshToken 匹配正确 token
  assert(
    service.compareRefreshToken(token, hash1) === true,
    'compareRefreshToken 匹配正确 token',
  );

  // 4. 篡改 token 后比对失败
  assert(
    service.compareRefreshToken(token + 'x', hash1) === false,
    '篡改后的 token 比对失败',
  );

  // 5. 空 hash 比对失败（防御空会话）
  assert(
    service.compareRefreshToken(token, '') === false,
    '空 hash 比对返回 false',
  );

  // 6. 不同密钥产出不同摘要
  const otherService = createTokenService('another-secret');
  const otherHash = otherService.hashRefreshToken(token);
  assert(otherHash !== hash1, '不同密钥产出不同摘要');

  // 7. 摘要不是明文，也不包含原始 token 片段
  assert(
    !hash1.includes('test') && !hash1.includes(token),
    '摘要不泄露原始 token 内容',
  );

  // 8. 性能：HMAC 单次计算应非常快（< 5ms），相比 bcrypt 显著优化
  const start = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) {
    service.hashRefreshToken(token + i);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert(
    elapsedMs < 500,
    `1000 次 HMAC 摘要耗时 ${elapsedMs.toFixed(2)}ms（远快于 bcrypt）`,
  );

  // 9. 签发令牌对并验证类型
  return service
    .issueTokens(
      {
        userId: 'u-1',
        username: 'tester',
        roles: ['user'],
        strategy: 'jwt',
        authenticatedAt: Date.now(),
      },
      'session-123',
    )
    .then(async (tokens) => {
      assert(!!tokens.accessToken, '签发 accessToken');
      assert(!!tokens.refreshToken, '签发 refreshToken');
      assert(tokens.expiresIn === 3600, 'expiresIn 为 3600 秒');
      assert(tokens.tokenType === 'Bearer', 'tokenType 为 Bearer');

      const accessPayload = await service.verifyToken(tokens.accessToken);
      assert(
        accessPayload.type === 'access',
        'accessToken 载荷 type=access',
      );
      assert(
        accessPayload.sub === 'session-123',
        'accessToken 载荷 sub=sessionId',
      );
      assert(accessPayload.username === 'tester', '载荷携带 username');
      assert(
        Array.isArray(accessPayload.roles) &&
          accessPayload.roles.includes('user'),
        '载荷携带角色',
      );

      const refreshPayload = await service.verifyToken(tokens.refreshToken);
      assert(
        refreshPayload.type === 'refresh',
        'refreshToken 载荷 type=refresh',
      );

      // 10. 非法 token 验证抛出异常
      let threw = false;
      try {
        await service.verifyToken('not.a.valid.token');
      } catch {
        threw = true;
      }
      assert(threw, '非法 token 验证抛出异常');
    });
}

module.exports = { run };
