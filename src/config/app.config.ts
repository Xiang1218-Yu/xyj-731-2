import { registerAs } from '@nestjs/config';
import { AuthStrategyType } from '../common/enums/auth-strategy.enum';

/**
 * 应用配置
 *
 * 通过 @nestjs/config 加载 .env 文件，并对外提供类型安全的配置对象。
 * 使用 registerAs 注册命名空间，可通过注入 ConfigType<typeof appConfig> 使用。
 */
export const appConfig = registerAs('app', () => ({
  /** 服务监听端口 */
  port: parseInt(process.env.APP_PORT || '3000', 10),
  /** 全局路由前缀 */
  prefix: process.env.APP_PREFIX || 'api',
  /**
   * 系统当前默认认证策略
   * 支持运行时通过管理接口动态切换（见 AuthStrategyContext）
   */
  defaultStrategy:
    (process.env.AUTH_STRATEGY as AuthStrategyType) || AuthStrategyType.JWT,
}));

/** JWT 策略相关配置 */
export const jwtConfig = registerAs('jwt', () => ({
  /** JWT 签名密钥 */
  secret: process.env.JWT_SECRET || 'dev-secret',
  /** access token 有效期（秒） */
  expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600', 10),
  /** refresh token 有效期（秒） */
  refreshExpiresIn: parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN || '604800',
    10,
  ),
}));

/** OAuth2.0 策略相关配置 */
export const oauth2Config = registerAs('oauth2', () => ({
  authUrl: process.env.OAUTH2_AUTH_URL || '',
  tokenUrl: process.env.OAUTH2_TOKEN_URL || '',
  userInfoUrl: process.env.OAUTH2_USERINFO_URL || '',
  clientId: process.env.OAUTH2_CLIENT_ID || '',
  clientSecret: process.env.OAUTH2_CLIENT_SECRET || '',
  callbackUrl: process.env.OAUTH2_CALLBACK_URL || '',
}));

/** LDAP 策略相关配置 */
export const ldapConfig = registerAs('ldap', () => ({
  url: process.env.LDAP_URL || 'ldap://localhost:389',
  bindDn: process.env.LDAP_BIND_DN || '',
  bindCredentials: process.env.LDAP_BIND_CREDENTIALS || '',
  searchBase: process.env.LDAP_SEARCH_BASE || '',
  searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
}));

/** Redis 相关配置 */
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0', 10),
  /** 会话 key 前缀 */
  sessionPrefix: process.env.REDIS_SESSION_PREFIX || 'auth:session:',
  /** Redis 不可用时是否降级到内存存储 */
  fallbackMemory: process.env.REDIS_FALLBACK_MEMORY === 'true',
}));
