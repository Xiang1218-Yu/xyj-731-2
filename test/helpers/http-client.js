/**
 * HTTP 请求辅助工具
 *
 * 基于 Node.js 内置 fetch（Node 18+ 原生支持），无第三方依赖。
 * 封装鉴权头、错误处理，供各测试用例调用。
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api';

/**
 * 发起 HTTP 请求
 * @param method HTTP 方法
 * @param path 接口路径（相对 /api 前缀）
 * @param options 请求选项
 */
async function request(method, path, options = {}) {
  const { token, body, headers = {} } = options;
  const url = `${BASE_URL}${path}`;

  const finalHeaders = { ...headers };
  if (body && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  const text = await resp.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    status: resp.status,
    statusText: resp.statusText,
    data,
    ok: resp.ok,
  };
}

module.exports = { request, BASE_URL };
