import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ErrorMessage } from '../../common/constants/error-messages';

/**
 * JWT 认证守卫
 *
 * 框架层认证核心：
 *  1. 从 Authorization 头解析 Bearer token
 *  2. 调用 AuthService.validateAccessToken 校验签名 + Redis 会话
 *  3. 将用户信息挂载到 request.user，供后续 RolesGuard 和控制器使用
 *
 * 支持通过 @Public() 装饰器标记免登录接口（如登录接口本身）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否标记为公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(ErrorMessage.GUARD_NO_TOKEN);
    }

    // 校验 token 与服务端会话
    const { payload, session } =
      await this.authService.validateAccessToken(token);

    // 挂载到 request，供后续守卫/控制器使用
    (request as any).user = { payload, session };
    return true;
  }

  /** 从 Authorization: Bearer <token> 中提取 token */
  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
