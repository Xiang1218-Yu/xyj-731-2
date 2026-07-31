/**
 * Swagger API 文档测试
 *
 * 验证文档可访问，且包含所有认证接口定义。
 */
const { request } = require('../helpers/http-client');
const { assert, assertEqual } = require('../helpers/assert');

async function run() {
  console.log('\n[Swagger API 文档]');

  // 拉取 OpenAPI JSON（Swagger 文档由 /docs 渲染，JSON 在 /docs-json）
  const resp = await fetch('http://localhost:3000/docs-json');
  assertEqual(resp.status, 200, 'OpenAPI JSON 文档可访问');

  const doc = await resp.json();
  assert(doc.info, '文档包含 info 信息');
  assert(doc.paths, '文档包含 paths 定义');

  const paths = Object.keys(doc.paths);
  const expectedPaths = [
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/strategy',
    '/api/auth/oauth2/authorize',
  ];

  for (const p of expectedPaths) {
    assert(paths.includes(p), `文档包含接口: ${p}`);
  }

  // 验证 login 接口为 POST
  assert(
    doc.paths['/api/auth/login']?.post,
    '登录接口定义为 POST',
  );

  // 验证文档标题
  assert(
    doc.info.title.includes('统一身份认证'),
    '文档标题包含"统一身份认证"',
  );

  // 验证 Bearer 鉴权方案已定义
  assert(
    doc.components?.securitySchemes?.['access-token'],
    '文档定义了 Bearer 鉴权方案',
  );
}

module.exports = { run };
