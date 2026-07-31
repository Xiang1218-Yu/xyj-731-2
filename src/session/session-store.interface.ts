/**
 * 会话存储抽象接口
 *
 * 定义会话存储的统一契约。具体实现可以是 Redis、内存、数据库等。
 * SessionService 依赖此抽象而非具体实现，符合依赖倒置原则。
 */
import { SessionData } from '../common/interfaces/authenticated-user.interface';

export interface SessionStore {
  /** 保存会话 */
  set(sessionId: string, data: SessionData, ttlSeconds: number): Promise<void>;
  /** 读取会话 */
  get(sessionId: string): Promise<SessionData | null>;
  /** 删除会话（登出/吊销） */
  delete(sessionId: string): Promise<void>;
  /** 刷新会话过期时间 */
  touch(sessionId: string, ttlSeconds: number): Promise<boolean>;
  /** 检查存储后端是否可用 */
  isAvailable(): boolean;
}
