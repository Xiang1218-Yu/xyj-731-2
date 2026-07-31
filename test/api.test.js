/**
 * 统一身份认证服务 - 接口测试脚本（Node.js，无第三方依赖）
 *
 * 运行方式：
 *   1. 先启动服务：npm run start（默认 http://localhost:3000）
 *   2. 执行测试：npm run test:api 或 node test/api.test.js
 *
 * 可通过环境变量 BASE_URL 指定服务地址。
 *
 * 覆盖用例：
 *   - 策略状态查询
 *   - JWT 策略登录 / 获取用户信息 / 权限校验（通过 & 拒绝）
 *   - 刷新令牌（含旧令牌轮换失效）
 *   - 登出后会话立即失效
 *   - 运行时动态切换策略（LDAP / OAuth2.0 登录验证）
 *   - 未认证请求拦截
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ---------------- 微型测试框架 ----------------
let passed = 0;
let failed = 0;

/** 断言工具 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
}

/** 用例执行器：统一捕获异常并输出结果 */
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** HTTP 请求封装：返回 { status, body } */
async function api(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // 204 无响应体
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : null };
}

// ---------------- 测试主流程 ----------------
async function main() {
  console.log(`\n目标服务: ${BASE_URL}\n`);

  // 等待服务就绪
  const health = await api('GET', '/auth/strategy');
  if (health.status !== 200) {
    console.error('服务未就绪，请先启动服务再执行测试');
    process.exit(1);
  }

  /** 保存各阶段产出的令牌，供后续用例使用 */
  let adminTokens = {};
  let aliceTokens = {};

  // ---------- 1. 策略状态 ----------
  console.log('【1】认证策略状态');
  await test('查询当前策略，默认应为 jwt', async () => {
    const { status, body } = await api('GET', '/auth/strategy');
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.activeStrategy === 'jwt', `默认策略应为 jwt，实际 ${body.activeStrategy}`);
    assert(
      body.availableStrategies.includes('jwt') &&
        body.availableStrategies.includes('oauth2') &&
        body.availableStrategies.includes('ldap'),
      '可用策略应包含 jwt / oauth2 / ldap',
    );
  });

  // ---------- 2. JWT 策略登录 ----------
  console.log('【2】JWT 策略登录与令牌校验');
  await test('错误密码登录应返回 401', async () => {
    const { status } = await api('POST', '/auth/login', {
      body: { username: 'admin', password: 'wrong-password' },
    });
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  await test('正确凭据登录应返回访问令牌与刷新令牌', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: 'admin', password: 'admin123' },
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.accessToken && body.refreshToken, '响应应包含 accessToken 与 refreshToken');
    assert(body.strategy === 'jwt', `策略应为 jwt，实际 ${body.strategy}`);
    adminTokens = body;
  });

  await test('携带访问令牌可获取用户信息', async () => {
    const { status, body } = await api('GET', '/auth/profile', {
      token: adminTokens.accessToken,
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.username === 'admin', `用户名应为 admin，实际 ${body.username}`);
  });

  await test('未携带令牌访问受保护接口应返回 401', async () => {
    const { status } = await api('GET', '/auth/profile');
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  // ---------- 3. 权限校验 ----------
  console.log('【3】权限校验守卫');
  await test('admin 具备 admin:access 权限，可访问管理端接口', async () => {
    const { status } = await api('GET', '/auth/admin-only', {
      token: adminTokens.accessToken,
    });
    assert(status === 200, `期望 200，实际 ${status}`);
  });

  await test('普通用户 alice 访问管理端接口应返回 403', async () => {
    const login = await api('POST', '/auth/login', {
      body: { username: 'alice', password: 'alice123' },
    });
    aliceTokens = login.body;
    const { status } = await api('GET', '/auth/admin-only', {
      token: aliceTokens.accessToken,
    });
    assert(status === 403, `期望 403，实际 ${status}`);
  });

  await test('alice 无 auth:strategy:switch 权限，切换策略应返回 403', async () => {
    const { status } = await api('POST', '/auth/strategy', {
      body: { strategy: 'ldap' },
      token: aliceTokens.accessToken,
    });
    assert(status === 403, `期望 403，实际 ${status}`);
  });

  // ---------- 4. 刷新令牌 ----------
  console.log('【4】刷新令牌与轮换');
  await test('使用刷新令牌可换取新令牌', async () => {
    const { status, body } = await api('POST', '/auth/refresh', {
      body: { refreshToken: aliceTokens.refreshToken },
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.accessToken && body.refreshToken, '应返回新的令牌对');
    assert(
      body.refreshToken !== aliceTokens.refreshToken,
      '刷新令牌应发生轮换',
    );
    aliceTokens.oldRefreshToken = aliceTokens.refreshToken;
    aliceTokens = { ...aliceTokens, ...body };
  });

  await test('旧刷新令牌轮换后应立即失效', async () => {
    const { status } = await api('POST', '/auth/refresh', {
      body: { refreshToken: aliceTokens.oldRefreshToken },
    });
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  await test('无效刷新令牌应返回 401', async () => {
    const { status } = await api('POST', '/auth/refresh', {
      body: { refreshToken: 'not-a-valid-refresh-token' },
    });
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  // ---------- 5. 运行时切换策略 + 多策略登录 ----------
  console.log('【5】运行时动态切换认证策略');
  await test('admin 切换策略为 ldap', async () => {
    const { status, body } = await api('POST', '/auth/strategy', {
      body: { strategy: 'ldap' },
      token: adminTokens.accessToken,
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.activeStrategy === 'ldap', `当前策略应为 ldap，实际 ${body.activeStrategy}`);
  });

  await test('LDAP 策略登录（模拟目录用户 carol）', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: 'carol', password: 'carol123' },
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.strategy === 'ldap', `策略应为 ldap，实际 ${body.strategy}`);
    assert(body.accessToken, '应返回访问令牌');
  });

  await test('切换策略为 oauth2', async () => {
    const { status, body } = await api('POST', '/auth/strategy', {
      body: { strategy: 'oauth2' },
      token: adminTokens.accessToken,
    });
    assert(status === 200 && body.activeStrategy === 'oauth2', '策略应切换为 oauth2');
  });

  await test('OAuth2 策略登录（模拟第三方令牌）', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { accessToken: 'mock-oauth-token-bob' },
    });
    assert(status === 200, `期望 200，实际 ${status}`);
    assert(body.strategy === 'oauth2', `策略应为 oauth2，实际 ${body.strategy}`);
  });

  await test('登录时显式指定 strategy 字段可覆盖全局策略', async () => {
    // 当前全局策略为 oauth2，显式指定 jwt 登录
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: 'admin', password: 'admin123', strategy: 'jwt' },
    });
    assert(status === 200 && body.strategy === 'jwt', '应按显式指定的 jwt 策略完成登录');
  });

  await test('切换为不支持的策略应返回 400', async () => {
    const { status } = await api('POST', '/auth/strategy', {
      body: { strategy: 'saml' },
      token: adminTokens.accessToken,
    });
    assert(status === 400, `期望 400，实际 ${status}`);
  });

  // 测试结束，恢复默认策略，避免影响后续运行
  await test('恢复默认策略为 jwt', async () => {
    const { status, body } = await api('POST', '/auth/strategy', {
      body: { strategy: 'jwt' },
      token: adminTokens.accessToken,
    });
    assert(status === 200 && body.activeStrategy === 'jwt', '策略应恢复为 jwt');
  });

  // ---------- 6. 登出与会话失效 ----------
  console.log('【6】登出与会话失效');
  await test('登出应返回 204', async () => {
    const { status } = await api('POST', '/auth/logout', {
      token: aliceTokens.accessToken,
    });
    assert(status === 204, `期望 204，实际 ${status}`);
  });

  await test('登出后原访问令牌立即失效（401）', async () => {
    const { status } = await api('GET', '/auth/profile', {
      token: aliceTokens.accessToken,
    });
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  await test('登出后原刷新令牌同时失效（401）', async () => {
    const { status } = await api('POST', '/auth/refresh', {
      body: { refreshToken: aliceTokens.refreshToken },
    });
    assert(status === 401, `期望 401，实际 ${status}`);
  });

  // ---------- 结果汇总 ----------
  console.log(`\n========================================`);
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 条`);
  console.log(`========================================\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
