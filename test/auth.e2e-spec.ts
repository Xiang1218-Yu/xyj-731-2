/**
 * 统一身份认证服务 - 端到端测试
 *
 * 使用 supertest 对运行中的 Nest 应用发起真实 HTTP 请求，覆盖:
 *  - 健康检查
 *  - 认证类型查询
 *  - JWT / OAuth2 / LDAP 三种策略登录（外部服务不可用时走本地回退）
 *  - 访问受保护资源
 *  - RBAC 权限校验
 *  - 令牌刷新
 *  - 登出与会话失效
 *
 * 运行: npm test
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('统一身份认证服务 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('健康检查', () => {
    it('GET /api/health 应返回 ok 与会话存储类型', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.sessionStore).toBeDefined();
    });
  });

  describe('认证类型', () => {
    it('GET /api/auth/types 应返回三种认证方式', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/types')
        .expect(200);
      expect(res.body.types).toEqual(
        expect.arrayContaining(['jwt', 'oauth2', 'ldap']),
      );
    });
  });

  describe('JWT 登录', () => {
    it('使用正确的账号密码应登录成功并返回令牌', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123456' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.roles).toContain('admin');
    });

    it('密码错误应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: 'wrong-password' })
        .expect(401);
    });

    it('不支持的 authType 应返回 500/400 错误', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'unknown', username: 'admin', password: '123456' })
        .expect(400);
    });
  });

  describe('OAuth2 登录 (本地回退)', () => {
    it('外部服务不可用时回退本地用户库认证', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          authType: 'oauth2',
          username: 'editor',
          password: '123456',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.authType).toBe('oauth2');
      expect(res.body.user.username).toBe('editor');
    });
  });

  describe('LDAP 登录 (本地回退)', () => {
    it('LDAP 服务不可用时回退本地用户库认证', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'ldap', username: 'viewer', password: '123456' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.authType).toBe('ldap');
      expect(res.body.user.username).toBe('viewer');
    });
  });

  describe('受保护资源与权限校验', () => {
    let adminToken: string;
    let viewerToken: string;

    beforeAll(async () => {
      const adminRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123456' });
      adminToken = adminRes.body.accessToken;

      const viewerRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'viewer', password: '123456' });
      viewerToken = viewerRes.body.accessToken;
    });

    it('未携带 token 访问受保护资源应返回 401', async () => {
      await request(app.getHttpServer())
        .get('/api/resources/profile')
        .expect(401);
    });

    it('公开接口无需登录即可访问', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/resources/public')
        .expect(200);
      expect(res.body.message).toBeDefined();
    });

    it('登录用户可访问 profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/resources/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.user.username).toBe('admin');
    });

    it('admin 可访问 admin 接口', async () => {
      await request(app.getHttpServer())
        .get('/api/resources/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('viewer 访问 admin 接口应返回 403', async () => {
      await request(app.getHttpServer())
        .get('/api/resources/admin')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    it('editor 可访问 editor 接口', async () => {
      const editorRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'editor', password: '123456' });
      await request(app.getHttpServer())
        .get('/api/resources/editor')
        .set('Authorization', `Bearer ${editorRes.body.accessToken}`)
        .expect(200);
    });

    it('viewer 访问 editor 接口应返回 403', async () => {
      await request(app.getHttpServer())
        .get('/api/resources/editor')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('刷新令牌与登出', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123456' });
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('使用 refreshToken 可刷新获取新令牌', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // 新 access token 应与旧的不同
      expect(res.body.accessToken).not.toBe(accessToken);
    });

    it('无效 refreshToken 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);
    });

    it('登出后使用旧 refreshToken 应失败（会话已销毁）', async () => {
      // 先登录获取一组新令牌
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123456' });
      const rt = loginRes.body.refreshToken;

      // 登出
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: rt })
        .expect(201);

      // 再次使用该 refreshToken 应失败
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: rt })
        .expect(401);
    });

    it('access token 可正常访问 /api/auth/profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.username).toBe('admin');
    });
  });

  describe('输入校验与配置防御', () => {
    it('登录缺少 authType 应返回 400 校验错误', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'admin', password: '123456' })
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('登录使用不支持的 authType 应返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          authType: 'unsupported',
          username: 'admin',
          password: '123456',
        })
        .expect(400);
    });

    it('JWT 登录密码过短应返回 400（DTO 校验）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123' })
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('refresh 接口缺少 refreshToken 应返回 400/401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('logout 接口缺少 refreshToken 应返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({})
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('健康检查应返回会话存储类型且为 redis 或 memory', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
      expect(['redis', 'memory']).toContain(res.body.sessionStore);
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('登录成功响应应包含完整的令牌元数据', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ authType: 'jwt', username: 'admin', password: '123456' })
        .expect(201);
      expect(res.body.accessToken).toMatch(/^eyJ/);
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.sessionId).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.user).toMatchObject({
        username: 'admin',
        authType: 'jwt',
      });
      expect(res.body.user.roles).toContain('admin');
      // 不应泄露敏感字段
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.passwordSalt).toBeUndefined();
    });
  });
});
