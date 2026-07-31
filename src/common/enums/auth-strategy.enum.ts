/**
 * 认证策略类型枚举
 *
 * 定义系统支持的所有认证策略。策略模式中的"策略标识"，
 * 运行时通过该枚举选择具体的认证策略实现。
 */
export enum AuthStrategyType {
  /** 本地 JWT 认证（用户名 + 密码，签发 JWT） */
  JWT = 'jwt',
  /** OAuth2.0 第三方认证（授权码模式） */
  OAUTH2 = 'oauth2',
  /** LDAP 目录服务认证 */
  LDAP = 'ldap',
}
