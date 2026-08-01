/**
 * SessionService 单元测试
 *
 * 覆盖配置校验与存储后端选择逻辑:
 *  - TTL 配置非法时构造函数抛异常
 *  - Redis 不可用且未启用降级时 onModuleInit 抛异常（阻止假启动）
 *  - Redis 不可用但启用降级时使用内存存储
 *  - Redis 可用时使用 Redis 存储
 */
import { ConfigService } from '@nestjs/config';
import { ConfigurationException } from '../common/exceptions/configuration.exception';
import { MemorySessionStore } from './memory-session.store';
import { RedisSessionStore } from './redis-session.store';
import { SessionService } from './session.service';

/** 构造 ConfigService mock */
function mockConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

/** 构造 RedisSessionStore mock，可自定义 isAvailable 返回值 */
function mockRedisStore(available: boolean): RedisSessionStore {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    touch: jest.fn().mockResolvedValue(true),
  } as unknown as RedisSessionStore;
}

describe('SessionService', () => {
  const memoryStore = new MemorySessionStore();

  describe('TTL 配置校验', () => {
    it('SESSION_TTL 缺失时应抛出 ConfigurationException', () => {
      const config = mockConfig({
        'redis.sessionTtl': undefined,
        'redis.fallbackMemory': true,
      });
      expect(
        () =>
          new SessionService(mockRedisStore(false), memoryStore, config),
      ).toThrow(ConfigurationException);
    });

    it('SESSION_TTL 为 0 时应抛出异常', () => {
      const config = mockConfig({
        'redis.sessionTtl': 0,
        'redis.fallbackMemory': true,
      });
      expect(
        () =>
          new SessionService(mockRedisStore(false), memoryStore, config),
      ).toThrow(ConfigurationException);
    });

    it('SESSION_TTL 为负数时应抛出异常', () => {
      const config = mockConfig({
        'redis.sessionTtl': -1,
        'redis.fallbackMemory': true,
      });
      expect(
        () =>
          new SessionService(mockRedisStore(false), memoryStore, config),
      ).toThrow(ConfigurationException);
    });

    it('SESSION_TTL 为合法正整数时应构造成功', () => {
      const config = mockConfig({
        'redis.sessionTtl': 86400,
        'redis.fallbackMemory': true,
      });
      expect(
        () =>
          new SessionService(mockRedisStore(true), memoryStore, config),
      ).not.toThrow();
    });
  });

  describe('存储后端选择（onModuleInit）', () => {
    it('Redis 可用时 createSession 应委托给 Redis 存储', async () => {
      const config = mockConfig({
        'redis.sessionTtl': 86400,
        'redis.fallbackMemory': true,
      });
      const redis = mockRedisStore(true);
      const service = new SessionService(redis, memoryStore, config);
      service.onModuleInit();
      await service.createSession({
        userId: '1',
        username: 'admin',
        authType: 'jwt',
        roles: ['admin'],
      });
      // Redis 存储的 set 应被调用，内存存储不应被调用
      expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('Redis 不可用但启用降级时 createSession 应委托给内存存储', async () => {
      const config = mockConfig({
        'redis.sessionTtl': 86400,
        'redis.fallbackMemory': true,
      });
      const redis = mockRedisStore(false);
      const service = new SessionService(redis, memoryStore, config);
      service.onModuleInit();
      const session = await service.createSession({
        userId: '1',
        username: 'admin',
        authType: 'jwt',
        roles: ['admin'],
      });
      // 通过内存存储能读回会话，证明确实使用了内存存储
      const fetched = await service.getSession(session.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched?.username).toBe('admin');
    });

    it('Redis 不可用且未启用降级时应抛出异常阻止启动', () => {
      const config = mockConfig({
        'redis.sessionTtl': 86400,
        'redis.fallbackMemory': false,
      });
      const redis = mockRedisStore(false);
      const service = new SessionService(redis, memoryStore, config);
      expect(() => service.onModuleInit()).toThrow(
        /Redis 不可用且未启用内存降级/,
      );
    });

    it('fallbackMemory 为非法字符串时应通过 getRequiredBoolean 抛出异常', () => {
      const config = mockConfig({
        'redis.sessionTtl': 86400,
        'redis.fallbackMemory': 'yes',
      });
      const redis = mockRedisStore(false);
      const service = new SessionService(redis, memoryStore, config);
      expect(() => service.onModuleInit()).toThrow(
        /无法解析为布尔值/,
      );
    });
  });

  describe('会话操作', () => {
    let service: SessionService;
    let redis: RedisSessionStore;

    beforeEach(() => {
      const config = mockConfig({
        'redis.sessionTtl': 3600,
        'redis.fallbackMemory': true,
      });
      redis = mockRedisStore(false);
      service = new SessionService(redis, memoryStore, config);
      service.onModuleInit();
    });

    it('createSession 应返回包含完整字段的会话数据', async () => {
      const session = await service.createSession({
        userId: '2',
        username: 'editor',
        authType: 'ldap',
        roles: ['editor'],
      });
      expect(session.sessionId).toMatch(/^[a-f0-9]{64}$/);
      expect(session.userId).toBe('2');
      expect(session.username).toBe('editor');
      expect(session.authType).toBe('ldap');
      expect(session.roles).toEqual(['editor']);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    });

    it('destroySession 后 getSession 应返回 null', async () => {
      const session = await service.createSession({
        userId: '1',
        username: 'admin',
        authType: 'jwt',
        roles: ['admin'],
      });
      await service.destroySession(session.sessionId);
      const fetched = await service.getSession(session.sessionId);
      expect(fetched).toBeNull();
    });
  });
});
