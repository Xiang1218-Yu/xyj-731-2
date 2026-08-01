/**
 * 已认证用户接口
 *
 * 所有认证策略在认证成功后都必须返回该结构的用户对象，
 * 以便上层服务（AuthService / 守卫 / 会话）统一处理，与具体认证方式解耦。
 */
export interface AuthenticatedUser {
  /** 用户唯一标识 */
  id: string;
  /** 登录用户名 */
  username: string;
  /** 展示名称 */
  displayName?: string;
  /** 邮箱 */
  email?: string;
  /** 角色列表，用于框架层权限校验 */
  roles: string[];
  /** 认证来源类型 */
  authType: string;
  /** 认证通过时间戳（毫秒） */
  authenticatedAt?: number;
}

/**
 * 登录凭证接口
 *
 * 不同认证策略所需的凭证字段不同，这里使用可选字段统一描述，
 * 各策略在实现时只读取自己关心的字段。
 */
export interface AuthCredentials {
  /** 用户名（JWT / LDAP 使用） */
  username?: string;
  /** 密码（JWT / LDAP 使用） */
  password?: string;
  /** OAuth2 授权码（授权码模式回调时使用） */
  code?: string;
  /** OAuth2 已有的 access token（令牌内省模式时使用） */
  accessToken?: string;
  /** OAuth2 state 参数，用于防 CSRF */
  state?: string;
}

/**
 * 认证结果接口
 *
 * 认证策略认证成功后返回的结果，包含用户信息以及策略特定的附加数据。
 */
export interface AuthResult {
  user: AuthenticatedUser;
  /** 策略返回的附加信息，例如 OAuth2 的原始令牌 */
  details?: Record<string, any>;
}

/**
 * 会话数据接口
 *
 * 存储在 Redis 中的会话结构。
 */
export interface SessionData {
  /** 会话 ID */
  sessionId: string;
  /** 关联的用户 ID */
  userId: string;
  /** 用户名 */
  username: string;
  /** 认证方式 */
  authType: string;
  /** 用户角色 */
  roles: string[];
  /** 会话创建时间（毫秒） */
  createdAt: number;
  /** 会话最后活跃时间（毫秒） */
  lastActiveAt: number;
  /** 会话过期时间（毫秒） */
  expiresAt: number;
  /** 关联的 refresh token ID（用于登出/吊销） */
  refreshTokenId?: string;
}
