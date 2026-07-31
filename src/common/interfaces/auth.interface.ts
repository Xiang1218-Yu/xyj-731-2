import { AuthStrategyType } from '../enums/auth-strategy.enum';

/**
 * 认证主体信息
 *
 * 所有认证策略在认证成功后，都必须返回统一格式的用户主体信息。
 * 这是策略模式的核心约定：不同策略产出相同结构，上层 AuthService
 * 无需关心底层是 JWT、OAuth2 还是 LDAP。
 */
export interface AuthPrincipal {
  /** 用户唯一标识 */
  userId: string;
  /** 登录用户名 */
  username: string;
  /** 用户显示名称 */
  displayName?: string;
  /** 邮箱 */
  email?: string;
  /** 用户拥有的角色列表（用于框架层权限校验） */
  roles: string[];
  /** 认证来源策略 */
  strategy: AuthStrategyType;
  /** 认证通过时间（毫秒时间戳） */
  authenticatedAt: number;
  /** 策略返回的原始属性（透传，供业务侧扩展） */
  raw?: Record<string, any>;
}

/**
 * 登录请求凭证
 *
 * 统一登录接口的入参。不同策略按需读取对应字段：
 * - JWT：username + password
 * - OAuth2：code（授权码）
 * - LDAP：username + password
 */
export interface CredentialPayload {
  username?: string;
  password?: string;
  /** OAuth2 授权码 */
  code?: string;
  /** OAuth2 state，用于防 CSRF */
  state?: string;
  /** 显式指定本次登录使用的策略；不传则使用系统当前默认策略 */
  strategy?: AuthStrategyType;
}

/**
 * 令牌对：Access Token + Refresh Token
 */
export interface TokenPair {
  /** 访问令牌（短期） */
  accessToken: string;
  /** 刷新令牌（长期，用于换取新的 accessToken） */
  refreshToken: string;
  /** accessToken 有效期（秒） */
  expiresIn: number;
  /** 令牌类型，固定 Bearer */
  tokenType: 'Bearer';
}

/**
 * 认证结果
 */
export interface AuthResult {
  /** 用户主体 */
  principal: AuthPrincipal;
  /** 签发的令牌对 */
  tokens: TokenPair;
}

/**
 * 存储在 Redis 中的会话结构
 */
export interface SessionRecord {
  /** 会话 ID */
  sessionId: string;
  /** 用户 ID */
  userId: string;
  /** 用户名 */
  username: string;
  /** 角色列表 */
  roles: string[];
  /** 使用的认证策略 */
  strategy: AuthStrategyType;
  /** 刷新令牌的哈希（不存明文，降低泄漏风险） */
  refreshTokenHash: string;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 过期时间（毫秒时间戳） */
  expiresAt: number;
  /** 扩展数据 */
  metadata?: Record<string, any>;
}
