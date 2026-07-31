/**
 * 认证策略接口（策略模式核心抽象）
 *
 * 每一种认证方式（JWT / OAuth2.0 / LDAP）都实现该接口。
 * AuthService 通过 AuthStrategyFactory 根据运行时传入的 authType 获取具体策略，
 * 从而在不修改上层逻辑的情况下扩展新的认证方式，符合开闭原则。
 */
import { AuthType } from '../../common/enums/auth-type.enum';
import {
  AuthCredentials,
  AuthResult,
} from '../../common/interfaces/authenticated-user.interface';

export interface AuthStrategy {
  /**
   * 策略类型标识，工厂据此注册与查找策略
   */
  readonly type: AuthType;

  /**
   * 执行认证
   * @param credentials 登录凭证（不同策略所需字段不同）
   * @returns 认证结果，包含统一的用户信息与策略附加数据
   * @throws UnauthorizedException 认证失败时抛出
   */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
}
