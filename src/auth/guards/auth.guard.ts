import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../services/token.service';
import { SessionService } from '../services/session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 认证守卫（框架层）。
 *
 * 职责：
 * 1. 跳过标注了 @Public() 的路由。
 * 2. 从 Authorization: Bearer <token> 中解析 access token 并校验。
 * 3. 校验令牌对应的会话仍存在于 Redis（支持登出即时失效）。
 * 4. 将解析出的用户信息挂载到 request.user，供后续守卫 / 控制器使用。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 公开路由直接放行
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少访问令牌');
    }

    // 校验 access token
    const payload = await this.tokenService.verifyAccessToken(token);

    // 校验会话是否已被吊销（黑名单，问题 7）——即便令牌本身未过期也应拒绝
    if (await this.sessionService.isRevoked(payload.sid)) {
      throw new UnauthorizedException('会话已被吊销，请重新登录');
    }

    // 校验会话是否仍然有效（实现登出即时生效）
    const session = await this.sessionService.getSession(payload.sid);
    if (!session) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    // 挂载用户信息到请求对象
    request.user = {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
      provider: payload.provider,
      sessionId: payload.sid,
    };
    return true;
  }

  /** 从请求头提取 Bearer token */
  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
