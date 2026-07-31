import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { AuthStrategyType } from '../interfaces/auth-strategy.interface';

/**
 * 登录请求 DTO。
 * strategy 字段用于运行时选择认证方式；不传则使用配置的默认策略。
 */
export class LoginDto {
  @ApiPropertyOptional({
    description: '认证策略，运行时动态切换。不传则使用默认策略',
    enum: AuthStrategyType,
    example: AuthStrategyType.JWT,
  })
  @IsOptional()
  @IsString()
  strategy?: string;

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
  password?: string;

  @ApiPropertyOptional({
    description: 'OAuth2 授权码（OAuth2 策略必填）',
    example: 'auth-code-from-provider',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
