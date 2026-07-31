/**
 * 应用统一配置加载器。
 * 通过 @nestjs/config 的工厂函数集中读取环境变量，
 * 并提供类型安全、带默认值的配置对象，避免各处散落 process.env 读取。
 */
export default () => ({
  // 服务监听端口
  port: parseInt(process.env.PORT, 10) || 3000,

  // 默认认证策略，可被登录请求中的 strategy 字段覆盖，实现运行时动态切换
  defaultAuthStrategy: process.env.DEFAULT_AUTH_STRATEGY || 'jwt',

  // JWT 相关配置
  jwt: {
    secret: process.env.JWT_SECRET || 'please-change-this-secret-in-production',
    accessExpiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN, 10) || 3600,
    refreshExpiresIn:
      parseInt(process.env.JWT_REFRESH_EXPIRES_IN, 10) || 604800,
  },

  // Redis 连接配置
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    sessionTtl: parseInt(process.env.SESSION_TTL, 10) || 604800,
  },

  // OAuth2.0（授权码模式）配置
  oauth2: {
    authorizationUrl: process.env.OAUTH2_AUTHORIZATION_URL || '',
    tokenUrl: process.env.OAUTH2_TOKEN_URL || '',
    userInfoUrl: process.env.OAUTH2_USERINFO_URL || '',
    clientId: process.env.OAUTH2_CLIENT_ID || '',
    clientSecret: process.env.OAUTH2_CLIENT_SECRET || '',
    redirectUri:
      process.env.OAUTH2_REDIRECT_URI ||
      'http://localhost:3000/auth/oauth2/callback',
    scope: process.env.OAUTH2_SCOPE || 'openid profile email',
  },

  // LDAP 配置
  ldap: {
    url: process.env.LDAP_URL || 'ldap://127.0.0.1:389',
    bindDnTemplate:
      process.env.LDAP_BIND_DN_TEMPLATE ||
      'uid={{username}},ou=people,dc=example,dc=com',
    searchBase: process.env.LDAP_SEARCH_BASE || 'ou=people,dc=example,dc=com',
    searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
  },
});
