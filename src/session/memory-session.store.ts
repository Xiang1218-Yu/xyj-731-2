/**
 * 内存会话存储（降级实现）
 *
 * 当 Redis 不可用（例如本地开发未启动 Redis、测试环境）时作为兜底实现，
 * 保证服务仍可启动并正常完成登录/登出流程。
 *
 * 注意: 内存存储不支持多实例共享，生产环境应使用 Redis。
 */
import { Injectable } from '@nestjs/common';
import { SessionData } from '../common/interfaces/authenticated-user.interface';
import { SessionStore } from './session-store.interface';

interface MemoryEntry {
  data: SessionData;
  expiresAt: number;
}

@Injectable()
export class MemorySessionStore implements SessionStore {
  private readonly store = new Map<string, MemoryEntry>();

  async set(
    sessionId: string,
    data: SessionData,
    ttlSeconds: number,
  ): Promise<void> {
    this.store.set(sessionId, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.store.get(sessionId);
    if (!entry) {
      return null;
    }
    // 惰性过期: 读取时检查是否已过期
    if (entry.expiresAt < Date.now()) {
      this.store.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async touch(sessionId: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.store.get(sessionId);
    if (!entry) {
      return false;
    }
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  isAvailable(): boolean {
    return true;
  }
}
