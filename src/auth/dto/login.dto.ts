import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';

/**
 * 统一登录请求 DTO
 *
 * 支持三种策略的登录：
 *  - JWT/LDAP：username + password
 *  - OAuth2：code（授权码）
 * strategy 字段可选，不传则使用系统当前默认策略，实现"单次请求动态切换策略"。
 */
export class LoginDto {
  @ApiPropertyOptional({
    description: '用户名（JWT / LDAP 策略必填）',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: '密码（JWT / LDAP 策略必填）',
    example: 'admin123',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @ApiPropertyOptional({
    description: 'OAuth2 授权码（OAuth2 策略必填）',
    example: 'abc123',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'OAuth2 state，用于防 CSRF',
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    description:
      '显式指定本次登录使用的认证策略；不传则使用系统当前默认策略（运行时可动态切换）',
    enum: AuthStrategyType,
    example: AuthStrategyType.JWT,
  })
  @IsOptional()
  @IsEnum(AuthStrategyType)
  strategy?: AuthStrategyType;
}
