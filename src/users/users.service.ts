/**
 * 用户服务
 *
 * 当前实现使用内存用户库作为演示数据源（框架层面不绑定具体业务系统）。
 * 真实项目中可替换为数据库实现（TypeORM / Prisma / Mongoose 等），
 * 只需保持本服务对外接口不变，认证策略无需任何修改。
 *
 * 内置三个演示账号（密码均为 123456）:
 *   - admin / Administrator (角色: admin, user)
 *   - editor / Editor User  (角色: editor, user)
 *   - viewer / Viewer User  (角色: user)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { SafeUser, User } from './user.interface';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly users = new Map<string, User>();

  onModuleInit() {
    // 初始化演示用户，密码统一为 123456
    this.seedUser('1', 'admin', 'Administrator', 'admin@example.com', [
      'admin',
      'user',
    ]);
    this.seedUser('2', 'editor', 'Editor User', 'editor@example.com', [
      'editor',
      'user',
    ]);
    this.seedUser('3', 'viewer', 'Viewer User', 'viewer@example.com', [
      'user',
    ]);
    this.logger.log('演示用户数据已初始化 (密码均为 123456)');
  }

  /**
   * 根据用户名查找用户（含密码哈希，仅用于认证校验）
   */
  async findByUsername(username: string): Promise<User | undefined> {
    return this.users.get(username);
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id: string): Promise<SafeUser | undefined> {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return this.toSafeUser(user);
      }
    }
    return undefined;
  }

  /**
   * 校验明文密码与存储的哈希是否匹配
   */
  verifyPassword(plain: string, hash: string, salt: string): boolean {
    if (!hash || !salt) {
      return false;
    }
    const computed = crypto.scryptSync(plain, salt, 64).toString('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * 移除敏感字段，返回安全用户视图
   */
  toSafeUser(user: User): SafeUser {
    const { passwordHash, passwordSalt, ...safe } = user;
    void passwordHash;
    void passwordSalt;
    return safe;
  }

  /**
   * 使用 scrypt 生成密码哈希并创建用户
   */
  private seedUser(
    id: string,
    username: string,
    displayName: string,
    email: string,
    roles: string[],
  ): void {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('123456', salt, 64).toString('hex');
    this.users.set(username, {
      id,
      username,
      displayName,
      email,
      roles,
      passwordHash: hash,
      passwordSalt: salt,
    });
  }
}
