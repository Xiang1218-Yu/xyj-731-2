import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';
import {
  AuthPrincipal,
  CredentialPayload,
} from '../../common/interfaces/auth.interface';

/**
 * 认证策略抽象接口
 *
 * 这是策略模式（Strategy Pattern）的核心抽象角色。
 * 所有具体认证策略（JWT、OAuth2、LDAP）都必须实现该接口。
 *
 * 上层 AuthStrategyContext 持有一个该接口的引用，
 * 运行时可根据配置/请求动态切换具体实现，达到"对扩展开放、对修改封闭"。
 */
export interface AuthStrategy {
  /** 策略类型标识 */
  readonly type: AuthStrategyType;

  /**
   * 执行认证
   *
   * @param credentials 登录凭证（不同策略读取不同字段）
   * @returns 认证成功后的统一用户主体；认证失败应抛出 UnauthorizedException
   */
  authenticate(credentials: CredentialPayload): Promise<AuthPrincipal>;
}
