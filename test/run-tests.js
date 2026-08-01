/**
 * 统一身份认证服务 —— 接口集成测试脚本（Node.js 原生编写，无测试框架依赖）。
 *
 * 覆盖场景：
 * 1. 查询可用策略
 * 2. JWT 策略登录 -> 获取 profile -> 角色/权限守卫 -> 刷新令牌 -> 登出 -> 登出后失效
 * 3. LDAP 策略登录（演示模式）
 * 4. OAuth2 策略登录（演示模式）+ 授权地址
 * 5. 各类失败用例（错误密码、缺令牌、权限不足、非法策略）
 *
 * 运行前请先启动服务：npm run start:dev
 * 运行：npm run test:api   （或 node test/run-tests.js）
 */
const { request, assert } = require('./http-client');

// 测试结果统计
let passed = 0;
let failed = 0;

/** 运行单个用例并记录结果 */
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

async function main() {
  console.log('\n=== 统一身份认证服务接口测试 ===\n');

  // ---------- 1. 可用策略 ----------
  console.log('[1] 可用策略');
  await test('GET /auth/strategies 返回三种策略', async () => {
    const res = await request('GET', '/auth/strategies');
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    const list = res.body.strategies || [];
    assert(list.includes('jwt'), '应包含 jwt');
    assert(list.includes('oauth2'), '应包含 oauth2');
    assert(list.includes('ldap'), '应包含 ldap');
  });

  // ---------- 2. JWT 主流程 ----------
  console.log('\n[2] JWT 策略主流程');
  let adminAccess, adminRefresh;
  await test('管理员使用 JWT 策略登录成功', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: 'admin', password: 'admin123' },
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(res.body.tokens.accessToken, '应返回 accessToken');
    assert(res.body.tokens.refreshToken, '应返回 refreshToken');
    assert(res.body.user.provider === 'jwt', 'provider 应为 jwt');
    adminAccess = res.body.tokens.accessToken;
    adminRefresh = res.body.tokens.refreshToken;
  });

  await test('携带令牌获取 profile 成功', async () => {
    const res = await request('GET', '/auth/profile', { token: adminAccess });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(res.body.username === 'admin', 'username 应为 admin');
  });

  await test('管理员可访问 admin-only（角色守卫）', async () => {
    const res = await request('GET', '/auth/admin-only', { token: adminAccess });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
  });

  await test('管理员拥有 user:write 权限（权限守卫）', async () => {
    const res = await request('GET', '/auth/need-permission', {
      token: adminAccess,
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
  });

  await test('刷新令牌成功且返回新令牌', async () => {
    const res = await request('POST', '/auth/refresh', {
      body: { refreshToken: adminRefresh },
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(res.body.tokens.accessToken, '应返回新 accessToken');
    // 更新为最新令牌用于后续登出
    adminAccess = res.body.tokens.accessToken;
    // 旧刷新令牌应已失效（轮换）
    const reuse = await request('POST', '/auth/refresh', {
      body: { refreshToken: adminRefresh },
    });
    assert(reuse.status === 401, `旧刷新令牌应失效，实际 ${reuse.status}`);
  });

  await test('登出成功', async () => {
    const res = await request('POST', '/auth/logout', { token: adminAccess });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
  });

  await test('登出后令牌失效', async () => {
    const res = await request('GET', '/auth/profile', { token: adminAccess });
    assert(res.status === 401, `期望 401，实际 ${res.status}`);
  });

  // ---------- 3. 普通用户权限边界 ----------
  console.log('\n[3] 普通用户权限边界');
  let userAccess;
  await test('普通用户登录成功', async () => {
    const res = await request('POST', '/auth/login', {
      body: { username: 'user', password: 'user123' }, // 不传 strategy，使用默认
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    userAccess = res.body.tokens.accessToken;
  });

  await test('普通用户访问 admin-only 被拒（403）', async () => {
    const res = await request('GET', '/auth/admin-only', { token: userAccess });
    assert(res.status === 403, `期望 403，实际 ${res.status}`);
  });

  await test('普通用户无 user:write 权限被拒（403）', async () => {
    const res = await request('GET', '/auth/need-permission', {
      token: userAccess,
    });
    assert(res.status === 403, `期望 403，实际 ${res.status}`);
  });

  // ---------- 4. LDAP 策略 ----------
  console.log('\n[4] LDAP 策略（演示模式）');
  await test('LDAP 登录成功', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'ldap', username: 'jdoe', password: 'secret' },
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(res.body.user.provider === 'ldap', 'provider 应为 ldap');
  });

  // ---------- 5. OAuth2 策略 ----------
  console.log('\n[5] OAuth2 策略（演示模式）');
  await test('获取 OAuth2 授权跳转地址', async () => {
    const res = await request('GET', '/auth/oauth2/authorize-url');
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(typeof res.body.url === 'string', '应返回 url');
    assert(res.body.state, '应返回 state');
  });

  await test('OAuth2 授权码登录成功', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'oauth2', code: 'demo-auth-code-123456' },
    });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
    assert(res.body.user.provider === 'oauth2', 'provider 应为 oauth2');
  });

  // ---------- 6. 失败用例 ----------
  console.log('\n[6] 失败用例');
  await test('错误密码返回 401', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: 'admin', password: 'wrong' },
    });
    assert(res.status === 401, `期望 401，实际 ${res.status}`);
  });

  await test('缺少令牌访问受保护接口返回 401', async () => {
    const res = await request('GET', '/auth/profile');
    assert(res.status === 401, `期望 401，实际 ${res.status}`);
  });

  await test('非法策略返回 400', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'saml', username: 'x', password: 'y' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  // ---------- 7. DTO 条件校验（问题 8）----------
  console.log('\n[7] 登录 DTO 条件校验');
  await test('JWT 策略缺少 password 返回 400', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: 'admin' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('LDAP 策略缺少 username 返回 400', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'ldap', password: 'secret' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('OAuth2 策略缺少 code 返回 400', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'oauth2' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('不传 strategy 时按默认(jwt)要求 username/password（缺失返回 400）', async () => {
    const res = await request('POST', '/auth/login', { body: {} });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('username 超长返回 400（边界校验）', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: 'a'.repeat(65), password: 'x' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('password 超长返回 400（边界校验，防 bcrypt DoS）', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: 'admin', password: 'p'.repeat(129) },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  await test('空白 username 返回 400（trim 后为空）', async () => {
    const res = await request('POST', '/auth/login', {
      body: { strategy: 'jwt', username: '   ', password: 'admin123' },
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
  });

  // ---------- 汇总 ----------
  console.log('\n=== 测试结果 ===');
  console.log(`通过：${passed}，失败：${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n测试运行异常（请确认服务已启动：npm run start:dev）');
  console.error(err.message);
  process.exit(1);
});
