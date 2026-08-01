/**
 * 登录请求 DTO
 *
 * authType 决定本次登录使用哪种认证策略（运行时动态切换）。
 * 其余字段为不同策略所需的凭证，按 authType 选择性传入。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthType } from '../../common/enums/auth-type.enum';

export class LoginDto {
  @ApiProperty({
    description: '认证类型: jwt(用户名密码) / oauth2(授权码或令牌) / ldap(目录账号)',
    enum: AuthType,
    example: AuthType.JWT,
  })
  @IsEnum(AuthType, { message: 'authType 必须为 jwt / oauth2 / ldap 之一' })
  authType: AuthType;

  @ApiPropertyOptional({ description: '用户名 (jwt/ldap/oauth2密码模式)', example: 'admin' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: '密码 (jwt/ldap/oauth2密码模式)', example: '123456' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: '密码长度不能少于 6 位' })
  password?: string;

  @ApiPropertyOptional({ description: 'OAuth2 授权码 (授权码模式回调)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'OAuth2 已有的 access_token (令牌内省模式)' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'OAuth2 state 参数 (防 CSRF)' })
  @IsOptional()
  @IsString()
  state?: string;
}
