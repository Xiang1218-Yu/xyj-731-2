/**
 * 用户实体
 *
 * 注意: passwordHash / passwordSalt 为敏感字段，不应在 API 响应中返回。
 */
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  /** scrypt 密码哈希(hex) */
  passwordHash: string;
  /** 密码盐值(hex) */
  passwordSalt: string;
}

/**
 * API 层使用的安全用户视图（不含敏感字段）
 */
export type SafeUser = Omit<User, 'passwordHash' | 'passwordSalt'>;
