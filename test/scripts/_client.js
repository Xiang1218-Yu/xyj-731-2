/**
 * 测试脚本共享 HTTP 客户端
 *
 * 基于 Node.js 18+ 内置的 fetch 封装，提供:
 *  - 统一的 BASE_URL 配置（通过环境变量 BASE_URL 覆盖，默认 http://localhost:3000）
 *  - 简洁的 get/post 方法
 *  - 轻量断言函数
 *
 * 所有独立测试脚本通过本客户端请求运行中的服务。
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * 发起 HTTP 请求并解析 JSON
 */
async function request(method, path, { body, token, headers } = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  };

  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let json = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: res.status, body: json, headers: res.headers };
}

module.exports = {
  BASE_URL,
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),

  /**
   * 断言工具: 断言条件为真，否则抛出带信息的错误
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(`❌ 断言失败: ${message}`);
    }
  },

  /**
   * 断言两个值相等
   */
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `❌ 断言失败: ${message || '值不相等'}，期望 ${JSON.stringify(
          expected,
        )}，实际 ${JSON.stringify(actual)}`,
      );
    }
  },
};
