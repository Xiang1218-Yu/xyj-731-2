/**
 * 全局配置项
 * 所有配置均可通过环境变量覆盖，默认值仅用于本地开发 / 测试
 */
export default () => ({
  // 服务监听端口
  port: parseInt(process.env.PORT, 10) || 3000,

  // JWT 相关配置（访问令牌签发）
  jwt: {
    secret: process.env.JWT_SECRET || 'unified-auth-secret',
    // 访问令牌过期时间（秒）
    accessTokenTtl: parseInt(process.env.ACCESS_TOKEN_TTL, 10) || 3600,
  },

  // 刷新令牌过期时间（秒）
  refreshTokenTtl: parseInt(process.env.REFRESH_TOKEN_TTL, 10) || 7 * 24 * 3600,

  // Redis 会话存储配置
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    // 连接失败重试次数，超过后降级为内存会话存储（便于无 Redis 环境下运行/测试）
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
  },

  // LDAP 服务器配置；未配置 LDAP_URL 时使用内置模拟目录（框架演示用途）
  ldap: {
    url: process.env.LDAP_URL || '',
    baseDn: process.env.LDAP_BASE_DN || 'dc=example,dc=com',
    userDnTemplate: process.env.LDAP_USER_DN_TEMPLATE || 'uid={{username}},ou=users,dc=example,dc=com',
  },

  // OAuth2.0 认证服务器配置；未配置 OAUTH2_USERINFO_URL 时使用内置模拟令牌校验（框架演示用途）
  oauth2: {
    userinfoUrl: process.env.OAUTH2_USERINFO_URL || '',
    clientId: process.env.OAUTH2_CLIENT_ID || '',
    clientSecret: process.env.OAUTH2_CLIENT_SECRET || '',
  },

  // 默认启用的认证策略：jwt | oauth2 | ldap
  defaultStrategy: process.env.DEFAULT_AUTH_STRATEGY || 'jwt',
});
