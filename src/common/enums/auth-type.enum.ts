/**
 * 认证类型枚举
 *
 * 定义系统支持的所有认证策略类型。
 * 客户端在调用 /auth/login 时通过 authType 字段指定本次登录使用的策略，
 * 服务端据此在运行时动态选择对应的认证策略实现（策略模式）。
 */
export enum AuthType {
  /** 基于 JSON Web Token 的本地账号认证 */
  JWT = 'jwt',
  /** 基于 OAuth2.0 协议的第三方认证 */
  OAUTH2 = 'oauth2',
  /** 基于 LDAP 目录服务的企业认证 */
  LDAP = 'ldap',
}
