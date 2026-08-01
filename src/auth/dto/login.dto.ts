import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthStrategyType } from '../interfaces/auth-strategy.interface';
import { RequiredForStrategy } from './required-for-strategy.validator';

// 字段长度边界常量（集中定义，便于统一维护与文档一致）
const USERNAME_MAX = 64;
// bcrypt 仅对前 72 字节有效，且过长口令会带来无谓的哈希开销/DoS 风险，故限制上限
const PASSWORD_MAX = 128;
const CODE_MAX = 2048;

/**
 * 登录请求 DTO。
 * strategy 字段用于运行时选择认证方式；不传则使用配置的默认策略（jwt）。
 *
 * 校验策略：
 * - 条件必填（问题 8）：JWT/LDAP 需 username+password，OAuth2 需 code。
 * - 边界校验（问题 2）：字段一旦提供，必须为字符串且满足长度上下限，防止空串/超长输入。
 * 二者由 RequiredForStrategy 统一处理（避免 @ValidateIf 跳过必填校验的冲突）。
 */
export class LoginDto {
  @ApiPropertyOptional({
    description: '认证策略，运行时动态切换。不传则使用默认策略',
    enum: AuthStrategyType,
    example: AuthStrategyType.JWT,
  })
  @IsOptional()
  @IsEnum(AuthStrategyType, {
    message: `strategy 只能是 ${Object.values(AuthStrategyType).join(' / ')}`,
  })
  strategy?: string;

  @ApiPropertyOptional({
    description: `用户名（JWT / LDAP 策略必填，长度 1-${USERNAME_MAX}）`,
    example: 'admin',
    maxLength: USERNAME_MAX,
  })
  @RequiredForStrategy(
    [AuthStrategyType.JWT, AuthStrategyType.LDAP],
    'username',
    { maxLength: USERNAME_MAX },
  )
  username?: string;

  @ApiPropertyOptional({
    description: `密码（JWT / LDAP 策略必填，长度 1-${PASSWORD_MAX}）`,
    example: 'admin123',
    maxLength: PASSWORD_MAX,
  })
  @RequiredForStrategy(
    [AuthStrategyType.JWT, AuthStrategyType.LDAP],
    'password',
    { maxLength: PASSWORD_MAX },
  )
  password?: string;

  @ApiPropertyOptional({
    description: `OAuth2 授权码（OAuth2 策略必填，长度 1-${CODE_MAX}）`,
    example: 'auth-code-from-provider',
    maxLength: CODE_MAX,
  })
  @RequiredForStrategy([AuthStrategyType.OAUTH2], 'code', {
    maxLength: CODE_MAX,
  })
  code?: string;
}
