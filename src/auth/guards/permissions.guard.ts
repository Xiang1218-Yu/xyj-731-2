import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 权限校验守卫（全局，框架级）
 * 在 JwtAuthGuard 之后执行：
 * 读取接口上 @RequirePermissions 声明的权限，
 * 当前用户具备其中任一权限即放行。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 公开接口无需权限校验
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 接口未声明权限要求时，登录用户均可访问
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      // 理论上不会到达（认证守卫已拦截），兜底处理
      throw new ForbiddenException('未认证的请求');
    }

    const owned: string[] = user.permissions ?? [];
    const pass = required.some((p) => owned.includes(p));
    if (!pass) {
      throw new ForbiddenException(
        `权限不足，需要权限: ${required.join(' 或 ')}`,
      );
    }
    return true;
  }
}
