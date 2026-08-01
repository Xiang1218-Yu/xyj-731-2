/**
 * 统一身份认证服务 - 接口测试脚本（Node.js 原生能力编写，复用项目依赖中的 ldapjs 搭建在测 LDAP 服务器）
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
 *   - 真实 LDAP 服务器集成（ldapjs 起在测服务器，验证 bind 与资源释放）
 *   - 第三方服务不可用时防挂起回归（黑洞服务器 + 超时断言）
 *
 * 依赖说明：
 *   本脚本 require 的 ldapjs 来自项目生产依赖（dependencies）。
 *   ldapjs 同时被生产代码 src/auth/strategies/ldap.strategy.ts 在运行时加载，
 *   因此必须保留在 dependencies 中（不能移入 devDependencies），
 *   测试脚本直接复用，无需重复声明。
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const net = require('net');
const ldap = require('ldapjs');
const { spawn } = require('child_process');
const path = require('path');

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
async function api(method, path, { body, token, baseUrl } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${baseUrl || BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // 204 无响应体
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : null };
}

// ---------------- 测试辅助工具 ----------------

/** 子进程日志环形缓冲的最大长度（字符），避免长时间运行占内存 */
const CHILD_LOG_TAIL_LENGTH = 4000;

/**
 * 以独立进程启动一个服务实例（用于真实 LDAP / 防挂起等需要独立配置的集成场景）
 * stdio 使用 pipe 并捕获输出到内存缓冲，便于启动失败时排查原因
 * @param port 监听端口
 * @param env 额外的环境变量（如 LDAP_URL、DEFAULT_AUTH_STRATEGY）
 * @returns { child, getLogTail } 子进程句柄与日志读取函数
 */
function startServiceInstance(port, env = {}) {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'dist', 'main.js')],
    {
      env: { ...process.env, PORT: String(port), ...env },
      stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout/stderr，便于失败排查
    },
  );

  // 环形缓冲：仅保留末尾 CHILD_LOG_TAIL_LENGTH 个字符
  let logTail = '';
  const appendLog = (chunk) => {
    logTail = (logTail + chunk.toString()).slice(-CHILD_LOG_TAIL_LENGTH);
  };
  child.stdout.on('data', appendLog);
  child.stderr.on('data', appendLog);

  return { child, getLogTail: () => logTail };
}

/**
 * 获取一个当前空闲的 TCP 端口
 * 避免硬编码端口（如 3100）与其他进程冲突导致子服务实例启动失败
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        // 边界处理：address() 可能返回 null（异常关闭）或 string（unix socket）
        if (!addr || typeof addr === 'string') {
          reject(new Error('获取空闲端口失败：address() 返回无效值'));
        } else {
          resolve(addr.port);
        }
      });
    });
  });
}

/**
 * 轮询等待服务实例就绪（/auth/strategy 返回 200）
 * 同时监听子进程退出事件：若子进程提前退出（如端口占用、配置错误），
 * 立即失败并输出捕获的日志，而不是空等超时
 */
async function waitServiceReady(port, instance, timeoutMs = 30000) {
  const { child, getLogTail } = instance;

  // 子进程早退检测：一旦退出立即置为失败原因
  let exitInfo = null;
  child.once('exit', (code, signal) => {
    exitInfo = { code, signal };
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // 子进程已退出：直接报错并附带启动日志
    if (exitInfo) {
      throw new Error(
        `端口 ${port} 的服务实例提前退出（code=${exitInfo.code}, signal=${exitInfo.signal}）\n` +
          `----- 子进程日志 -----\n${getLogTail() || '（无输出）'}\n----------------------`,
      );
    }
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/auth/strategy`);
      if (resp.ok) return;
    } catch {
      // 服务尚未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `端口 ${port} 的服务实例启动超时（>${timeoutMs}ms）\n` +
      `----- 子进程日志 -----\n${getLogTail() || '（无输出）'}\n----------------------`,
  );
}

/** 优雅停止子进程 */
function stopServiceInstance(instance) {
  return new Promise((resolve) => {
    const child = instance && instance.child;
    if (!child || child.killed) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    // 兜底：2 秒后仍未退出则强杀
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 2000).unref();
  });
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

  // ---------- 7. 真实 LDAP 服务器集成 ----------
  // 场景：通过环境变量 LDAP_URL 指向一个真实的 LDAP 服务器（测试内用 ldapjs 临时启动），
  // 验证真实 bind 认证链路，以及 bind 后 unbind + destroy 的资源释放时序不破坏正常认证。
  console.log('【7】真实 LDAP 服务器集成');
  let ldapServer = null;
  let ldapService = null;
  try {
    // 启动一个内存 LDAP 服务器：接受 carol/carol123，其余凭据拒绝
    ldapServer = ldap.createServer();
    ldapServer.bind('ou=users,dc=example,dc=com', (req, res, next) => {
      if (
        req.dn.toString() === 'uid=carol,ou=users,dc=example,dc=com' &&
        req.credentials === 'carol123'
      ) {
        res.end();
        return next();
      }
      return next(new ldap.InvalidCredentialsError('凭据无效'));
    });
    await new Promise((resolve) => ldapServer.listen(0, '127.0.0.1', resolve));
    // 边界处理：listen 后 address() 可能返回 null（服务器异常关闭）或 string（unix socket）
    const ldapAddr = ldapServer.address();
    if (!ldapAddr || typeof ldapAddr === 'string') {
      throw new Error('LDAP 测试服务器启动失败：address() 返回无效值');
    }
    const ldapPort = ldapAddr.port;

    // 以服务实例方式启动应用：动态分配空闲端口，避免端口冲突导致启动失败
    const ldapTestPort = await getFreePort();
    ldapService = startServiceInstance(ldapTestPort, {
      LDAP_URL: `ldap://127.0.0.1:${ldapPort}`,
      DEFAULT_AUTH_STRATEGY: 'ldap',
    });
    await waitServiceReady(ldapTestPort, ldapService);
    const ldapBase = `http://127.0.0.1:${ldapTestPort}`;

    await test('真实 LDAP bind 认证成功（carol/carol123）', async () => {
      const { status, body } = await api('POST', '/auth/login', {
        body: { username: 'carol', password: 'carol123' },
        baseUrl: ldapBase,
      });
      assert(status === 200, `期望 200，实际 ${status}`);
      assert(body.strategy === 'ldap', `策略应为 ldap，实际 ${body.strategy}`);
      assert(body.accessToken, '应返回访问令牌');
    });

    await test('真实 LDAP bind 认证失败（错误密码）', async () => {
      const { status } = await api('POST', '/auth/login', {
        body: { username: 'carol', password: 'wrong' },
        baseUrl: ldapBase,
      });
      assert(status === 401, `期望 401，实际 ${status}`);
    });

    await test('连续多次 bind 认证无资源泄漏异常（unbind/destroy 时序正确）', async () => {
      // 连续触发多次认证，若 unbind/destroy 时序有误，会出现连接异常或认证失败
      for (let i = 0; i < 5; i++) {
        const { status } = await api('POST', '/auth/login', {
          body: { username: 'carol', password: 'carol123' },
          baseUrl: ldapBase,
        });
        assert(status === 200, `第 ${i + 1} 次认证期望 200，实际 ${status}`);
      }
    });
  } finally {
    // 清理：停止子服务实例与 LDAP 测试服务器
    if (ldapService) await stopServiceInstance(ldapService);
    if (ldapServer) ldapServer.close();
  }

  // ---------- 8. 第三方服务不可用时防挂起回归 ----------
  // 场景：LDAP_URL 指向一个"黑洞"TCP 服务器（接受连接但永不响应），
  // 验证 bind 整体超时兜底生效：请求在合理时间内返回 401 而不是挂起。
  console.log('【8】第三方服务不可用防挂起');
  let blackhole = null;
  let hangService = null;
  try {
    // 黑洞服务器：接受连接后不做任何响应
    blackhole = net.createServer(() => undefined);
    await new Promise((resolve) => blackhole.listen(0, '127.0.0.1', resolve));
    // 边界处理：listen 后 address() 可能返回 null（服务器异常关闭）或 string（unix socket）
    const blackholeAddr = blackhole.address();
    if (!blackholeAddr || typeof blackholeAddr === 'string') {
      throw new Error('黑洞服务器启动失败：address() 返回无效值');
    }
    const blackholePort = blackholeAddr.port;

    // 动态分配空闲端口，避免端口冲突
    const hangTestPort = await getFreePort();
    hangService = startServiceInstance(hangTestPort, {
      LDAP_URL: `ldap://127.0.0.1:${blackholePort}`,
      DEFAULT_AUTH_STRATEGY: 'ldap',
    });
    await waitServiceReady(hangTestPort, hangService);
    const hangBase = `http://127.0.0.1:${hangTestPort}`;

    await test('LDAP 服务器无响应时登录请求不挂起（超时返回 401）', async () => {
      const start = Date.now();
      const { status } = await api('POST', '/auth/login', {
        body: { username: 'carol', password: 'carol123' },
        baseUrl: hangBase,
      });
      const elapsed = Date.now() - start;
      assert(status === 401, `期望 401，实际 ${status}`);
      // LDAP bind 超时 5s，断言 9s 内返回（留有余量且小于全局超时 10s）
      assert(elapsed < 9000, `请求耗时 ${elapsed}ms，超过 9000ms，疑似挂起`);
    });

    await test('服务在第三方超时后仍可正常处理后续请求', async () => {
      // 验证超时兜底后服务自身未受影响
      const { status } = await api('GET', '/auth/strategy', { baseUrl: hangBase });
      assert(status === 200, `期望 200，实际 ${status}`);
    });
  } finally {
    if (hangService) await stopServiceInstance(hangService);
    if (blackhole) blackhole.close();
  }

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
