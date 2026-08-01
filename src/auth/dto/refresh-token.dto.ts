import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** 刷新令牌请求 DTO */
export class RefreshTokenDto {
  @ApiProperty({
    description: '登录时下发的刷新令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
