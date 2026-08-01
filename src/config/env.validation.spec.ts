/**
 * env.validation 单元测试
 *
 * 覆盖启动期环境变量校验逻辑:
 *  - 合法配置通过校验
 *  - 各类非法格式（端口、时长、URL、LDAP filter 等）被拒绝
 *  - 生产环境的强制约束（JWT_SECRET、ALLOW_LOCAL_FALLBACK）
 */
import { validate } from './env.validation';

/** 基础合法配置，各测试在此基础上做增量修改 */
const baseValidEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  JWT_SECRET: 'a-very-long-dev-secret-key-123456',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_ISSUER: 'unified-auth-service',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6379',
  REDIS_DB: '0',
  REDIS_KEY_PREFIX: 'auth:session:',
  SESSION_TTL: '86400',
  REDIS_FALLBACK_MEMORY: 'true',
  OAUTH2_AUTHORIZATION_URL: 'https://example.com/oauth/authorize',
  OAUTH2_TOKEN_URL: 'https://example.com/oauth/token',
  OAUTH2_USERINFO_URL: 'https://example.com/oauth/userinfo',
  OAUTH2_CLIENT_ID: 'client-id',
  OAUTH2_CLIENT_SECRET: 'client-secret',
  OAUTH2_CALLBACK_URL: 'http://localhost:3000/api/auth/oauth2/callback',
  OAUTH2_SCOPE: 'openid profile',
  LDAP_URL: 'ldap://127.0.0.1:389',
  LDAP_BIND_DN: 'cn=admin,dc=example,dc=com',
  LDAP_BIND_CREDENTIALS: 'admin-password',
  LDAP_SEARCH_BASE: 'ou=users,dc=example,dc=com',
  LDAP_SEARCH_FILTER: '(uid={{username}})',
  ALLOW_LOCAL_FALLBACK: 'true',
};

describe('env.validation', () => {
  describe('合法配置', () => {
    it('完整合法配置应通过校验', () => {
      const result = validate({ ...baseValidEnv });
      expect(result).toBeDefined();
    });

    it('仅提供最少必填项（其余走默认值）也应通过', () => {
      // validate 对可选字段 skipMissingProperties，未设置的字段由 configuration.ts 提供默认值
      const minimal = {
        NODE_ENV: 'development',
      };
      const result = validate(minimal);
      expect(result).toBeDefined();
    });
  });

  describe('非法格式应被拒绝', () => {
    it('非法 PORT 应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, PORT: 'abc' }),
      ).toThrow(/PORT/);
    });

    it('端口超出范围应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, PORT: '99999' }),
      ).toThrow(/PORT/);
    });

    it('非法 JWT_EXPIRES_IN 格式应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, JWT_EXPIRES_IN: '15x' }),
      ).toThrow(/JWT_EXPIRES_IN/);
    });

    it('非法 JWT_REFRESH_EXPIRES_IN 格式应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, JWT_REFRESH_EXPIRES_IN: 'abc' }),
      ).toThrow(/JWT_REFRESH_EXPIRES_IN/);
    });

    it('JWT_SECRET 长度不足应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, JWT_SECRET: 'short' }),
      ).toThrow(/JWT_SECRET/);
    });

    it('非法 OAUTH2_TOKEN_URL 应抛出异常', () => {
      expect(() =>
        validate({
          ...baseValidEnv,
          OAUTH2_TOKEN_URL: 'not-a-url',
        }),
      ).toThrow(/OAUTH2_TOKEN_URL/);
    });

    it('非法 LDAP_URL（不以 ldap:// 开头）应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, LDAP_URL: 'http://bad' }),
      ).toThrow(/LDAP_URL/);
    });

    it('LDAP_SEARCH_FILTER 缺少 {{username}} 占位符应抛出异常', () => {
      expect(() =>
        validate({
          ...baseValidEnv,
          LDAP_SEARCH_FILTER: '(uid=admin)',
        }),
      ).toThrow(/LDAP_SEARCH_FILTER/);
    });

    it('非法 NODE_ENV 应抛出异常', () => {
      expect(() =>
        validate({ ...baseValidEnv, NODE_ENV: 'staging' }),
      ).toThrow(/NODE_ENV/);
    });

    it('非法布尔值应抛出异常', () => {
      expect(() =>
        validate({
          ...baseValidEnv,
          REDIS_FALLBACK_MEMORY: 'yes',
        }),
      ).toThrow(/REDIS_FALLBACK_MEMORY/);
    });
  });

  describe('生产环境强制约束', () => {
    it('生产环境缺少 JWT_SECRET 应抛出异常', () => {
      const env = { ...baseValidEnv, NODE_ENV: 'production' };
      delete (env as Record<string, unknown>).JWT_SECRET;
      expect(() => validate(env)).toThrow(
        /生产环境.*必须显式配置 JWT_SECRET/,
      );
    });

    it('生产环境使用默认不安全 JWT_SECRET 应抛出异常', () => {
      expect(() =>
        validate({
          ...baseValidEnv,
          NODE_ENV: 'production',
          JWT_SECRET: 'dev-insecure-secret-change-me',
        }),
      ).toThrow(/默认\/不安全值/);
    });

    it('生产环境 ALLOW_LOCAL_FALLBACK=true 应抛出异常', () => {
      expect(() =>
        validate({
          ...baseValidEnv,
          NODE_ENV: 'production',
          JWT_SECRET: 'a-valid-long-production-secret-key-123456',
          ALLOW_LOCAL_FALLBACK: 'true',
        }),
      ).toThrow(/禁止启用 ALLOW_LOCAL_FALLBACK/);
    });

    it('生产环境配置合法时应通过校验', () => {
      const result = validate({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a-valid-long-production-secret-key-123456',
        ALLOW_LOCAL_FALLBACK: 'false',
        REDIS_FALLBACK_MEMORY: 'true',
      });
      expect(result).toBeDefined();
    });
  });
});
