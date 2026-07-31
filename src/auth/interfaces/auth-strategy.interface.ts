/**
 * 认证相关的公共类型定义。
 * 集中定义可复用的接口与枚举，避免类型散落各处。
 */

/** 支持的认证策略枚举 */
export enum AuthStrategyType {
  JWT = 'jwt',
  OAUTH2 = 'oauth2',
  LDAP = 'ldap',
}

/**
 * 认证凭证。
 * 不同策略使用的字段不同：
 * - JWT / LDAP：使用 username + password
 * - OAuth2：使用授权码 code（授权码模式）
 */
export interface AuthCredentials {
  username?: string;
  password?: string;
  code?: string; // OAuth2 授权码
  [key: string]: unknown;
}

/**
 * 认证通过后返回的标准用户信息。
 * 各策略需将自身的用户数据归一化为该结构。
 */
export interface AuthenticatedUser {
  userId: string; // 用户唯一标识
  username: string; // 登录名 / 显示名
  email?: string; // 邮箱（可选）
  roles: string[]; // 角色列表，用于权限校验
  permissions: string[]; // 细粒度权限列表
  // 认证来源策略，便于审计与后续刷新时路由到对应策略
  provider: AuthStrategyType;
  // 各策略可携带的额外原始信息
  raw?: Record<string, unknown>;
}

/**
 * 认证策略统一接口（策略模式核心抽象）。
 * 每种认证方式实现该接口，登录时由 AuthStrategyRegistry 按名称选择具体实现，
 * 从而支持运行时动态切换认证方式。
 */
export interface IAuthStrategy {
  /** 策略类型标识 */
  readonly type: AuthStrategyType;

  /**
   * 执行认证。
   * @param credentials 登录凭证
   * @returns 归一化后的用户信息；认证失败应抛出 UnauthorizedException
   */
  authenticate(credentials: AuthCredentials): Promise<AuthenticatedUser>;
}

/** 会话数据结构，存储于 Redis */
export interface SessionData {
  sessionId: string; // 会话唯一 ID
  user: AuthenticatedUser; // 认证用户信息
  provider: AuthStrategyType; // 认证来源策略
  createdAt: number; // 创建时间（ms 时间戳）
  refreshTokenId: string; // 关联的刷新令牌 ID（用于刷新与吊销）
}

/** 登录成功返回的令牌对 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access token 过期时间（秒）
}
