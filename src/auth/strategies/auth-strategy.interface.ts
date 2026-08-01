/**
 * 认证策略统一接口（策略模式核心抽象）
 * 所有认证策略（JWT / OAuth2.0 / LDAP）都必须实现该接口，
 * 由 StrategyManager 统一注册并在运行时动态切换。
 */

/** 认证通过后返回的标准化用户信息 */
export interface AuthenticatedUser {
  /** 用户唯一标识 */
  userId: string;
  /** 用户名 */
  username: string;
  /** 用户权限列表（框架级演示权限，可对接业务系统的 RBAC） */
  permissions: string[];
  /** 认证来源策略名称 */
  provider: string;
}

/** 统一认证入参（不同策略按需取用字段） */
export interface AuthCredentials {
  /** 用户名（JWT 本地账号 / LDAP 登录使用） */
  username?: string;
  /** 密码（JWT 本地账号 / LDAP bind 使用） */
  password?: string;
  /** 第三方访问令牌（OAuth2.0 使用） */
  accessToken?: string;
}

/** 认证策略接口 */
export interface IAuthStrategy {
  /** 策略唯一名称：jwt | oauth2 | ldap */
  readonly name: string;

  /**
   * 执行认证
   * @param credentials 统一认证入参
   * @returns 认证成功返回标准化用户，失败返回 null
   */
  authenticate(credentials: AuthCredentials): Promise<AuthenticatedUser | null>;
}
