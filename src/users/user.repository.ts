import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

/** 用户记录（密码以 bcrypt 哈希形式存储，绝不保存明文） */
export interface UserRecord {
  userId: string;
  username: string;
  passwordHash: string; // bcrypt 哈希
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * 用户仓储（抽象数据访问层）。
 *
 * 安全改造要点：
 * - 不再把明文密码硬编码在业务代码里；密码统一以 bcrypt 哈希存储。
 * - 提供 findByUsername + verifyPassword 语义化方法，业务层不接触哈希细节。
 * - 目前用内存 Map 作为演示实现，生产环境可替换为数据库实现（保持相同接口）。
 * - 演示用户仅在 demoUsers.enabled 为真时注入，可通过环境变量整体关闭。
 */
@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);
  private readonly users = new Map<string, UserRecord>();

  constructor(private readonly configService: ConfigService) {
    const demoCfg = this.configService.get('demoUsers');
    if (demoCfg?.enabled) {
      this.seedDemoUsers();
      this.logger.warn(
        '已注入演示用户（bcrypt 哈希存储）。生产环境请设置 DEMO_USERS_ENABLED=false 并接入真实用户存储。',
      );
    }
  }

  /** 按用户名查找用户，不存在返回 null */
  async findByUsername(username: string): Promise<UserRecord | null> {
    return this.users.get(username) ?? null;
  }

  /**
   * 校验明文密码是否与用户存储的哈希匹配（bcrypt 常量时间比较，抵御时序攻击）。
   */
  async verifyPassword(user: UserRecord, plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, user.passwordHash);
  }

  /**
   * 注入演示用户。密码在启动时用 bcrypt 现场哈希，代码中不出现可直接比较的明文常量。
   * 演示口令来源于环境变量，缺省仅用于本地开发。
   */
  private seedDemoUsers(): void {
    const saltRounds = 10;
    const adminPwd = process.env.DEMO_ADMIN_PASSWORD || 'admin123';
    const userPwd = process.env.DEMO_USER_PASSWORD || 'user123';

    const records: Array<Omit<UserRecord, 'passwordHash'> & { plain: string }> = [
      {
        userId: '1',
        username: 'admin',
        plain: adminPwd,
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: ['user:read', 'user:write', 'system:manage'],
      },
      {
        userId: '2',
        username: 'user',
        plain: userPwd,
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['user:read'],
      },
    ];

    for (const r of records) {
      const { plain, ...rest } = r;
      this.users.set(r.username, {
        ...rest,
        passwordHash: bcrypt.hashSync(plain, saltRounds),
      });
    }
  }
}
