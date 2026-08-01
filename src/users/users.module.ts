import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';

/**
 * 用户模块：对外提供 UserRepository（用户数据访问 + 密码校验）。
 * 独立成模块，便于后续替换为数据库实现而不影响认证策略。
 */
@Module({
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
