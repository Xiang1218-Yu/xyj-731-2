/**
 * 极简 HTTP 客户端封装，基于 Node 内置 http 模块，
 * 无第三方依赖，供各测试脚本复用。
 */
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * 发起 HTTP 请求。
 * @param {string} method 请求方法
 * @param {string} path 请求路径（如 /auth/login）
 * @param {object} [options] { body, token }
 * @returns {Promise<{status:number, body:any}>}
 */
function request(method, path, options = {}) {
  const { body, token } = options;
  const url = new URL(path, BASE_URL);
  const payload = body ? JSON.stringify(body) : null;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 简单断言，失败抛错 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`断言失败：${message}`);
  }
}

module.exports = { request, assert, BASE_URL };
