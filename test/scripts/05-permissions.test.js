/**
 * 测试脚本 05: 权限校验中间件 (RBAC)
 * 运行: node test/scripts/05-permissions.test.js
 *
 * 验证框架层的认证守卫(JwtAuthGuard)与角色守卫(RolesGuard)。
 */
const { post, get, assert, assertEqual } = require('./_client');

async function login(username, password = '123456') {
  const res = await post('/api/auth/login', {
    authType: 'jwt',
    username,
    password,
  });
  return res.body;
}

async function run() {
  console.log('\n▶ [05] 权限校验中间件 (RBAC)');

  const admin = await login('admin');
  const editor = await login('editor');
  const viewer = await login('viewer');

  // 1. 公开接口无需登录
  const pub = await get('/api/resources/public');
  assertEqual(pub.status, 200, '公开接口应 200');
  console.log('  ✅ 公开接口无需登录');

  // 2. 未登录访问受保护接口 401
  const noAuth = await get('/api/resources/profile');
  assertEqual(noAuth.status, 401, '未登录应 401');
  console.log('  ✅ 未登录访问受保护接口被拒绝 (401)');

  // 3. 任意登录用户可访问 profile
  const profile = await get('/api/resources/profile', {
    token: viewer.accessToken,
  });
  assertEqual(profile.status, 200, '登录用户访问 profile 应 200');
  console.log('  ✅ 登录用户可访问 profile');

  // 4. admin 可访问 admin 接口
  const adminOk = await get('/api/resources/admin', {
    token: admin.accessToken,
  });
  assertEqual(adminOk.status, 200, 'admin 访问 admin 接口应 200');
  console.log('  ✅ admin 可访问管理员接口');

  // 5. viewer 访问 admin 接口 403
  const viewerForbidden = await get('/api/resources/admin', {
    token: viewer.accessToken,
  });
  assertEqual(viewerForbidden.status, 403, 'viewer 访问 admin 应 403');
  console.log('  ✅ viewer 访问管理员接口被拒绝 (403)');

  // 6. editor 可访问 editor 接口
  const editorOk = await get('/api/resources/editor', {
    token: editor.accessToken,
  });
  assertEqual(editorOk.status, 200, 'editor 访问 editor 接口应 200');
  console.log('  ✅ editor 可访问编辑者接口');

  // 7. viewer 访问 editor 接口 403
  const viewerEditorForbidden = await get('/api/resources/editor', {
    token: viewer.accessToken,
  });
  assertEqual(
    viewerEditorForbidden.status,
    403,
    'viewer 访问 editor 应 403',
  );
  console.log('  ✅ viewer 访问编辑者接口被拒绝 (403)');

  // 8. admin 也可访问 editor 接口（角色满足其一即可）
  const adminEditor = await get('/api/resources/editor', {
    token: admin.accessToken,
  });
  assertEqual(adminEditor.status, 200, 'admin 访问 editor 接口应 200');
  console.log('  ✅ admin 同样可访问编辑者接口');

  // 9. 无效 token 应 401
  const invalid = await get('/api/resources/profile', {
    token: 'invalid.token.here',
  });
  assertEqual(invalid.status, 401, '无效 token 应 401');
  console.log('  ✅ 无效 token 被拒绝 (401)');

  console.log('  🎉 [05] 通过\n');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
