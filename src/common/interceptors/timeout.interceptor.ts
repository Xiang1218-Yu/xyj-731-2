import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import configuration from '../../config/configuration';

/**
 * 全局请求超时拦截器
 * 对处理器整体执行时长进行限制（含下游第三方调用），
 * 超时后返回 408，避免请求长时间挂起耗尽连接资源。
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /** 超时阈值（毫秒），可通过 REQUEST_TIMEOUT_MS 环境变量覆盖 */
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = configuration().requestTimeoutMs;
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    return next.handle().pipe(
      // 超过 timeoutMs 未产出响应即触发 TimeoutError
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          const req = context.switchToHttp().getRequest();
          return throwError(
            () =>
              new RequestTimeoutException(
                `请求处理超时（>${this.timeoutMs}ms）: ${req.method} ${req.url}，请稍后重试`,
              ),
          );
        }
        // 非超时错误原样抛出，交由后续异常过滤器处理
        return throwError(() => err);
      }),
    );
  }
}
