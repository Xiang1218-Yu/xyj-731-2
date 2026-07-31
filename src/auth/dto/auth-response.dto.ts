/**
 * 认证成功响应 DTO
 */
import { ApiProperty } from '@nestjs/swagger';

class UserInfoDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'admin' })
  username: string;

  @ApiProperty({ example: 'Administrator' })
  displayName?: string;

  @ApiProperty({ example: 'admin@example.com' })
  email?: string;

  @ApiProperty({ type: [String], example: ['admin', 'user'] })
  roles: string[];

  @ApiProperty({ example: 'jwt' })
  authType: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: '访问令牌', example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌', example: 'a1b2c3d4e5f6...' })
  refreshToken: string;

  @ApiProperty({ description: '访问令牌有效期(秒)', example: 900 })
  expiresIn: number;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: '用户信息', type: UserInfoDto })
  user: UserInfoDto;

  @ApiProperty({ description: '会话 ID', example: 'f8e9d0c1...' })
  sessionId: string;
}
