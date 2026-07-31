import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 统一登录请求 DTO
 * 不同策略使用不同字段：
 * - jwt / ldap：username + password
 * - oauth2：accessToken
 */
export class LoginDto {
  @ApiPropertyOptional({ description: '用户名（jwt / ldap 策略必填）', example: 'admin' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: '密码（jwt / ldap 策略必填）', example: 'admin123' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: '第三方访问令牌（oauth2 策略必填）',
    example: 'mock-oauth-token-bob',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: '指定本次登录使用的策略（不传则使用当前全局生效策略）',
    example: 'jwt',
    enum: ['jwt', 'oauth2', 'ldap'],
  })
  @IsOptional()
  @IsString()
  strategy?: string;
}

/**
 * 刷新令牌请求 DTO
 */
export class RefreshTokenDto {
  @ApiProperty({ description: '登录时签发的刷新令牌' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

/**
 * 切换认证策略请求 DTO
 */
export class SwitchStrategyDto {
  @ApiProperty({
    description: '目标策略名',
    enum: ['jwt', 'oauth2', 'ldap'],
    example: 'ldap',
  })
  @IsNotEmpty()
  @IsString()
  strategy: string;
}
