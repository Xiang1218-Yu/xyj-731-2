import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AuthStrategyType } from '../../common/enums/auth-strategy.enum';

/** 切换认证策略请求 DTO */
export class SetStrategyDto {
  @ApiProperty({
    description: '要切换为的默认认证策略',
    enum: AuthStrategyType,
    example: AuthStrategyType.LDAP,
  })
  @IsEnum(AuthStrategyType)
  strategy!: AuthStrategyType;
}
