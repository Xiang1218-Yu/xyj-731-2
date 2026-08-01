/**
 * 刷新令牌请求 DTO
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: '登录时获取的 refreshToken',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string;
}
