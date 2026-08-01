import { ApiProperty } from '@nestjs/swagger';

/** 令牌对响应结构（用于 Swagger 文档展示） */
export class TokenPairVo {
  @ApiProperty({ description: '访问令牌', example: 'eyJhbGciOiJ...' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌', example: 'eyJhbGciOiJ...' })
  refreshToken: string;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: '访问令牌有效期（秒）', example: 3600 })
  expiresIn: number;
}

/** 用户信息响应结构 */
export class UserVo {
  @ApiProperty({ description: '用户 ID', example: '1' })
  userId: string;

  @ApiProperty({ description: '用户名', example: 'admin' })
  username: string;

  @ApiProperty({ description: '邮箱', required: false })
  email?: string;

  @ApiProperty({ description: '角色列表', example: ['admin'] })
  roles: string[];

  @ApiProperty({ description: '权限列表', example: ['user:read'] })
  permissions: string[];

  @ApiProperty({ description: '认证来源策略', example: 'jwt' })
  provider: string;
}

/** 登录响应结构 */
export class LoginResponseVo {
  @ApiProperty({ type: UserVo })
  user: UserVo;

  @ApiProperty({ type: TokenPairVo })
  tokens: TokenPairVo;
}
