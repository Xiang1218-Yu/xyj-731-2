import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务封装。
 *
 * 设计要点：
 * 1. 统一管理 ioredis 客户端的生命周期（连接 / 断开）。
 * 2. 内存降级仅在显式开启（REDIS_ALLOW_MEMORY_FALLBACK=true）时可用，
 *    默认关闭：生产/分布式部署必须依赖真实 Redis，避免多实例间会话状态不一致（问题 6）。
 *    未开启降级且 Redis 不可用时，启动直接失败（fail-fast），暴露配置问题。
 * 3. 对外暴露 get / set / del / expire / delIfEquals 等语义化方法，屏蔽底层差异。
 * 4. 提供 publish / subscribe 的 Pub/Sub 能力：发布使用主连接，订阅使用独立连接
 *    （ioredis 进入订阅模式的连接不能再执行普通命令），支持跨实例事件同步。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  // 专用于订阅的连接（订阅模式下不能复用主连接执行普通命令）
  private subscriber: Redis | null = null;

  // 降级用的内存存储：key -> { value, expireAt(ms 时间戳，0 表示永不过期) }
  private readonly memoryStore = new Map<
    string,
    { value: string; expireAt: number }
  >();

  // 频道 -> 本地回调集合（用于订阅分发；内存模式下也可支持同进程内通知）
  private readonly channelHandlers = new Map<
    string,
    Set<(message: string) => void>
  >();

  // 标记当前是否处于内存降级模式
  private useMemoryFallback = false;
  // 是否允许内存降级（来自配置）
  private allowMemoryFallback = false;
  // 启动是否已判定失败（用于抑制 fail-fast 后的重复错误日志）
  private startupFailed = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时尝试建立 Redis 连接。
   * 使用 lazyConnect + 手动 connect，便于捕获连接失败。
   */
  async onModuleInit(): Promise<void> {
    const redisConfig = this.configService.get('redis');
    this.allowMemoryFallback = !!redisConfig.allowMemoryFallback;

    try {
      this.client = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        lazyConnect: true,
        // 只重试有限次数，避免启动时长时间阻塞
        retryStrategy: (times) => (times > 3 ? null : 200),
        maxRetriesPerRequest: 1,
      });

      // 监听错误事件，防止未捕获异常导致进程崩溃。
      // 启动阶段（fatal 前）静默，避免与 fail-fast 日志重复刷屏。
      this.client.on('error', (err) => {
        if (!this.startupFailed) {
          this.logger.warn(`Redis 连接异常：${err.message}`);
        }
      });

      await this.client.connect();
      this.logger.log('Redis 连接成功');
    } catch (err) {
      // 安全改造（问题 6）：连接失败时，是否降级取决于显式配置。
      if (this.allowMemoryFallback) {
        this.useMemoryFallback = true;
        this.logger.warn(
          `无法连接 Redis（${err.message}），已启用内存会话存储。` +
            `警告：内存存储不适用于分布式部署，仅供本地开发/演示使用！`,
        );
      } else {
        // 默认行为：直接终止启动，阻止服务在无可靠会话存储的情况下运行。
        // 关键：先彻底断开客户端，移除监听并停止自动重连，
        // 否则 ioredis 会在进程退出前继续重试并抛出未处理的 CONNECTION_CLOSED 异常（问题 4）。
        this.startupFailed = true;
        this.teardownClient();
        this.logger.error(
          `无法连接 Redis（${err.message}），且未开启内存降级（REDIS_ALLOW_MEMORY_FALLBACK）。服务启动终止。`,
        );
        // 抛出简洁的致命错误，避免向上冒泡 ioredis 的原始堆栈
        throw new Error(
          'Redis 不可用且未启用内存降级：请启动 Redis 或设置 REDIS_ALLOW_MEMORY_FALLBACK=true（仅限开发）',
        );
      }
    }
  }

  /**
   * 彻底拆除 Redis 客户端：移除全部监听、强制断开且不再重连。
   * 用于 fail-fast 场景，防止残留连接在进程退出前持续重试并抛未处理异常。
   */
  private teardownClient(): void {
    if (this.client) {
      this.client.removeAllListeners();
      // disconnect(false) 立即断开且不触发重连
      try {
        this.client.disconnect(false);
      } catch {
        // 忽略断开过程中的异常
      }
      this.client = null;
    }
    if (this.subscriber) {
      this.subscriber.removeAllListeners();
      try {
        this.subscriber.disconnect(false);
      } catch {
        // 忽略
      }
      this.subscriber = null;
    }
  }

  /** 模块销毁时优雅关闭 Redis 连接（主连接 + 订阅连接） */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
    }
  }

  /** 写入键值，可选设置过期时间（秒） */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMemoryMode()) {
      const expireAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
      this.memoryStore.set(key, { value, expireAt });
      return;
    }
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** 读取键值，不存在或已过期返回 null */
  async get(key: string): Promise<string | null> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      // 惰性过期：读取时判断是否过期
      if (item.expireAt && item.expireAt < Date.now()) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }
    return this.client.get(key);
  }

  /** 删除键 */
  async del(key: string): Promise<void> {
    if (this.isMemoryMode()) {
      this.memoryStore.delete(key);
      return;
    }
    await this.client.del(key);
  }

  /**
   * 条件删除：仅当 key 当前值等于 expectedValue 时才删除（原子操作）。
   * 用于避免并发场景下误删他人写入的映射（问题 5）。
   * @returns 是否发生了删除
   */
  async delIfEquals(key: string, expectedValue: string): Promise<boolean> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (item && item.value === expectedValue) {
        this.memoryStore.delete(key);
        return true;
      }
      return false;
    }
    // 使用 Lua 脚本保证"比较+删除"的原子性
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    const result = (await this.client.eval(script, 1, key, expectedValue)) as number;
    return result === 1;
  }

  /** 更新键的过期时间（秒） */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isMemoryMode()) {
      const item = this.memoryStore.get(key);
      if (item) {
        item.expireAt = Date.now() + ttlSeconds * 1000;
      }
      return;
    }
    await this.client.expire(key, ttlSeconds);
  }

  /**
   * 发布消息到频道（用于会话吊销的全局广播，问题 7）。
   *
   * 问题 3：内存降级模式下没有真正的跨实例广播能力，不能让调用方误以为广播成功：
   * - 记录 warn 日志，明确提示"仅在本进程内分发，无跨实例效果"。
   * - 仍在本进程内触发已注册的订阅回调（保证单实例功能可用与可测）。
   * - 返回实际投递到的订阅者数量，便于调用方感知广播范围。
   *
   * @returns 收到该消息的订阅者数量（Redis 模式为集群内订阅数；内存模式为本进程回调数）
   */
  async publish(channel: string, message: string): Promise<number> {
    if (this.isMemoryMode()) {
      this.logger.warn(
        `内存降级模式下 publish("${channel}") 无跨实例广播能力，仅在本进程内分发（不适用于分布式部署）`,
      );
      return this.dispatchLocal(channel, message);
    }
    return this.client.publish(channel, message);
  }

  /**
   * 订阅频道并注册回调（问题 1：为吊销事件提供监听侧）。
   *
   * - Redis 模式：使用独立的订阅连接，收到消息后分发给本地回调。
   * - 内存模式：仅登记本地回调，配合 publish 的本进程分发工作。
   * 支持对同一频道注册多个回调；重复订阅同一频道不会重复向 Redis 发起 subscribe。
   */
  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<void> {
    // 登记本地回调
    let handlers = this.channelHandlers.get(channel);
    const isNewChannel = !handlers;
    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
    }
    handlers.add(handler);

    if (this.isMemoryMode()) {
      // 内存模式：无需真实连接，仅依赖本地回调
      return;
    }

    // 懒创建订阅连接（复用主连接的配置）
    if (!this.subscriber) {
      this.subscriber = this.client.duplicate();
      this.subscriber.on('error', (err) => {
        this.logger.warn(`Redis 订阅连接异常：${err.message}`);
      });
      // 统一的消息分发入口
      this.subscriber.on('message', (ch: string, msg: string) => {
        this.dispatchLocal(ch, msg);
      });
    }

    // 同一频道只向 Redis 订阅一次
    if (isNewChannel) {
      await this.subscriber.subscribe(channel);
      this.logger.log(`已订阅频道：${channel}`);
    }
  }

  /** 将消息分发给本地已注册的所有回调，返回回调数量 */
  private dispatchLocal(channel: string, message: string): number {
    const handlers = this.channelHandlers.get(channel);
    if (!handlers || handlers.size === 0) {
      return 0;
    }
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (err) {
        this.logger.warn(
          `频道 ${channel} 的订阅回调执行异常：${(err as Error).message}`,
        );
      }
    }
    return handlers.size;
  }

  /** 判断当前是否处于内存降级模式（供外部感知，如健康检查） */
  isDegraded(): boolean {
    return this.isMemoryMode();
  }

  /**
   * 判断是否使用内存降级模式。
   * 仅在显式开启降级且客户端不可用时才走内存存储。
   */
  private isMemoryMode(): boolean {
    if (!this.allowMemoryFallback) {
      return false;
    }
    return (
      this.useMemoryFallback || !this.client || this.client.status !== 'ready'
    );
  }
}
