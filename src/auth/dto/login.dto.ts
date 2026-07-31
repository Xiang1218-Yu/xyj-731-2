import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthStrategyType } from '../interfaces/auth-strategy.interface';
import { RequiredForStrategy } from './required-for-strategy.validator';

/**
 * 登录请求 DTO。
 * strategy 字段用于运行时选择认证方式；不传则使用配置的默认策略（jwt）。
 *
 * 安全改造（问题 8）：不再全部字段 @IsOptional，改为按策略条件必填：
 * - JWT / LDAP：username + password 必填。
 * - OAuth2：code 必填。
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
    description: '用户名（JWT / LDAP 策略必填）',
    example: 'admin',
  })
  @RequiredForStrategy(
    [AuthStrategyType.JWT, AuthStrategyType.LDAP],
    'username',
  )
  username?: string;

  @ApiPropertyOptional({
    description: '密码（JWT / LDAP 策略必填）',
    example: 'admin123',
  })
  @RequiredForStrategy(
    [AuthStrategyType.JWT, AuthStrategyType.LDAP],
    'password',
  )
  password?: string;

  @ApiPropertyOptional({
    description: 'OAuth2 授权码（OAuth2 策略必填）',
    example: 'auth-code-from-provider',
  })
  @RequiredForStrategy([AuthStrategyType.OAUTH2], 'code')
  code?: string;
}
