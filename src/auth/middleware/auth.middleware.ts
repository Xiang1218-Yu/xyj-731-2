import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TokenService } from '../services/token.service';

/**
 * 认证中间件（框架层，早于路由守卫执行）。
 *
 * 与 AuthGuard 的分工：
 * - 中间件在请求进入路由前运行，做"尽力而为"的令牌预解析：
 *   若携带合法 access token，则把用户信息提前挂载到 request，并记录访问日志；
 *   即便没有令牌或令牌无效，也不在此处直接拦截，交由 AuthGuard 做最终强制校验。
 * - 这样既满足"基础权限校验中间件"的框架诉求，又保持职责单一、可组合。
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name);

  constructor(private readonly tokenService: TokenService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers['authorization'];
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        try {
          // 预解析令牌，成功则挂载用户上下文
          const payload = await this.tokenService.verifyAccessToken(token);
          (req as any).user = {
            userId: payload.sub,
            username: payload.username,
            roles: payload.roles,
            permissions: payload.permissions,
            provider: payload.provider,
            sessionId: payload.sid,
          };
        } catch (err) {
          // 安全改造（问题 4）：预解析失败不再静默忽略，需记录失败原因用于安全审计。
          // 此处仅记录，不直接拦截，最终由 AuthGuard 决策，避免影响公开接口。
          this.logger.warn(
            `令牌预解析失败：${err?.message || err} | ${req.method} ${req.originalUrl} | ip=${clientIp}`,
          );
        }
      } else {
        // 携带了 Authorization 头但格式不合法，记录以便审计
        this.logger.warn(
          `非法的 Authorization 头格式 | ${req.method} ${req.originalUrl} | ip=${clientIp}`,
        );
      }
    }
    // 简单访问日志，便于审计
    this.logger.debug(`${req.method} ${req.originalUrl} | ip=${clientIp}`);
    next();
  }
}
