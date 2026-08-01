/**
 * 应用配置加载器
 *
 * 统一从环境变量中读取配置，并按模块分组，供整个应用通过 ConfigService 使用。
 * 所有配置项均提供默认值，确保在未配置 .env 的情况下也能本地启动。
 */

export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  allowLocalFallback: (process.env.ALLOW_LOCAL_FALLBACK || 'true') === 'true',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'unified-auth-service',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'auth:session:',
    sessionTtl: parseInt(process.env.SESSION_TTL || '86400', 10),
    fallbackMemory: (process.env.REDIS_FALLBACK_MEMORY || 'true') === 'true',
  },

  oauth2: {
    authorizationUrl:
      process.env.OAUTH2_AUTHORIZATION_URL ||
      'https://example-oauth2-server.com/oauth/authorize',
    tokenUrl:
      process.env.OAUTH2_TOKEN_URL ||
      'https://example-oauth2-server.com/oauth/token',
    userInfoUrl:
      process.env.OAUTH2_USERINFO_URL ||
      'https://example-oauth2-server.com/oauth/userinfo',
    clientId: process.env.OAUTH2_CLIENT_ID || 'your-client-id',
    clientSecret: process.env.OAUTH2_CLIENT_SECRET || 'your-client-secret',
    callbackUrl:
      process.env.OAUTH2_CALLBACK_URL ||
      'http://localhost:3000/api/auth/oauth2/callback',
    scope: process.env.OAUTH2_SCOPE || 'openid profile email',
  },

  ldap: {
    url: process.env.LDAP_URL || 'ldap://127.0.0.1:389',
    bindDn: process.env.LDAP_BIND_DN || 'cn=admin,dc=example,dc=com',
    bindCredentials: process.env.LDAP_BIND_CREDENTIALS || 'admin-password',
    searchBase:
      process.env.LDAP_SEARCH_BASE || 'ou=users,dc=example,dc=com',
    searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
  },
});
