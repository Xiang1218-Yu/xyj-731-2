import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 客户端注入标识
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Redis 客户端工厂
 *
 * 根据配置创建 ioredis 实例。
 * - 若 Redis 连接失败且开启 fallbackMemory，则创建一个"内存版"客户端，
 *   使用 Map 模拟 get/set/del/expire，保证本地无 Redis 时服务仍可启动。
 * - 生产环境务必部署真实 Redis 以获得跨实例会话共享能力。
 *
 * 注意：内存降级实现仅用于开发/测试，不保证完整 Redis 语义，
 * 仅覆盖本项目会话存储所需的 get/set（带 TTL）/del 操作。
 */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<Redis | MemoryRedis> => {
    const host = config.get<string>('redis.host');
    const port = config.get<number>('redis.port');
    const password = config.get<string>('redis.password');
    const db = config.get<number>('redis.db');
    const fallback = config.get<boolean>('redis.fallbackMemory');

    const logger = new Logger('RedisFactory');

    return new Promise((resolve) => {
      let settled = false;
      // 创建 ioredis 客户端，retryStrategy 控制重连
      const client = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => {
          // 重试 3 次后放弃，交由降级逻辑处理
          if (times > 3) return null;
          return 200;
        },
      });

      const fallbackToMemory = (reason: string) => {
        if (settled) return;
        settled = true;
        if (fallback) {
          logger.warn(
            `Redis 连接失败（${reason}），已降级到内存存储。生产环境请检查 Redis 配置。`,
          );
          try {
            client.disconnect();
          } catch {
            /* ignore */
          }
          resolve(new MemoryRedis());
        } else {
          logger.error(`Redis 连接失败（${reason}），且未开启降级，服务将无法正常工作。`);
          resolve(client);
        }
      };

      client.on('error', (err: Error) => {
        fallbackToMemory(err.message);
      });

      // 给一个短暂的连接探测窗口
      setTimeout(() => {
        if (settled) return;
        if (client.status === 'ready') {
          settled = true;
          logger.log(`Redis 已连接: ${host}:${port}`);
          resolve(client);
        } else {
          fallbackToMemory('连接超时');
        }
      }, 1500);
    });
  },
};

/**
 * 内存版 Redis
 *
 * 仅实现会话存储所需的最小接口，带 TTL 过期。
 * 实现与 ioredis 兼容的 get/set/del 签名，便于上层无感切换。
 */
export class MemoryRedis {
  private readonly store = new Map<string, { value: string; expireAt?: number }>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** 读取值，若已过期返回 null */
  async get(key: string): Promise<string | null> {
    this.cleanup(key);
    const item = this.store.get(key);
    return item ? item.value : null;
  }

  /**
   * 写入值
   * 支持 EX（秒）参数，与 ioredis 的 set(key, value, 'EX', seconds) 对齐
   */
  async set(
    key: string,
    value: string,
    flag?: 'EX',
    seconds?: number,
  ): Promise<'OK'> {
    const expireAt =
      flag === 'EX' && seconds ? Date.now() + seconds * 1000 : undefined;
    this.store.set(key, { value, expireAt });

    if (this.timers.has(key)) clearTimeout(this.timers.get(key)!);
    if (expireAt) {
      const ttl = Math.max(0, expireAt - Date.now());
      const timer = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttl);
      this.timers.set(key, timer);
    }
    return 'OK';
  }

  /** 删除键 */
  async del(key: string): Promise<number> {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
    return this.store.delete(key) ? 1 : 0;
  }

  /** 扫描所有键（简化实现，用于管理接口列出会话） */
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    return Array.from(this.store.keys()).filter((k) => {
      this.cleanup(k);
      return this.store.has(k) && regex.test(k);
    });
  }

  private cleanup(key: string): void {
    const item = this.store.get(key);
    if (item && item.expireAt && item.expireAt <= Date.now()) {
      this.store.delete(key);
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key)!);
        this.timers.delete(key);
      }
    }
  }
}
