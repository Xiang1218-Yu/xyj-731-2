import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionService } from '../../session/session.service';
import configuration from '../../config/configuration';

/**
 * JWT 身份认证守卫（全局）
 * 职责：
 * 1. 校验 Authorization 头中的 Bearer 访问令牌
 * 2. 校验令牌对应的会话仍然有效（登出后会话被删除，令牌立即失效）
 * 3. 将用户信息挂载到 request.user，供后续权限守卫使用
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() 标记的接口直接放行
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少访问令牌');
    }

    let payload: any;
    try {
      // 校验令牌签名与有效期
      payload = await this.jwtService.verifyAsync(token, {
        secret: configuration().jwt.secret,
      });
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }

    // 校验会话是否仍然存在（支持服务端主动登出使令牌失效）
    const session = await this.sessionService.get(payload.sid);
    if (!session) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    // 挂载用户信息，供权限守卫与业务接口使用
    (request as any).user = {
      userId: payload.sub,
      username: payload.username,
      permissions: session.permissions,
      sessionId: payload.sid,
      strategy: session.strategy,
    };
    return true;
  }

  /** 从 Authorization 头提取 Bearer 令牌 */
  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : null;
  }
}
