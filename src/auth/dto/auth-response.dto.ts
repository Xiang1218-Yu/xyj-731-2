import { ApiProperty } from '@nestjs/swagger';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';

/** 用户主体响应 */
export class PrincipalResponseDto {
  @ApiProperty({ description: '用户 ID', example: 'u-1001' })
  userId!: string;

  @ApiProperty({ description: '用户名', example: 'admin' })
  username!: string;

  @ApiProperty({
    description: '显示名称',
    example: '系统管理员',
    required: false,
  })
  displayName?: string;

  @ApiProperty({
    description: '邮箱',
    example: 'admin@example.com',
    required: false,
  })
  email?: string;

  @ApiProperty({
    description: '角色列表',
    type: [String],
    example: ['admin', 'user'],
  })
  roles!: string[];

  @ApiProperty({
    description: '认证策略',
    enum: AuthStrategyType,
    example: AuthStrategyType.JWT,
  })
  strategy!: AuthStrategyType;

  @ApiProperty({ description: '认证时间（毫秒时间戳）' })
  authenticatedAt!: number;
}

/** 令牌对响应 */
export class TokenResponseDto {
  @ApiProperty({ description: '访问令牌' })
  accessToken!: string;

  @ApiProperty({ description: '刷新令牌' })
  refreshToken!: string;

  @ApiProperty({ description: 'accessToken 有效期（秒）', example: 3600 })
  expiresIn!: number;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType!: string;
}

/** 登录/刷新响应 */
export class LoginResponseDto {
  @ApiProperty({ description: '用户主体', type: PrincipalResponseDto })
  principal!: PrincipalResponseDto;

  @ApiProperty({ description: '令牌对', type: TokenResponseDto })
  tokens!: TokenResponseDto;
}

/** 策略信息响应 */
export class StrategyInfoDto {
  @ApiProperty({ description: '当前默认策略', enum: AuthStrategyType })
  current!: AuthStrategyType;

  @ApiProperty({
    description: '所有可用策略',
    type: [String],
    enum: AuthStrategyType,
  })
  available!: AuthStrategyType[];
}
