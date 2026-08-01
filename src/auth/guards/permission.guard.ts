import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * 权限守卫（框架层，仅做通用的角色 / 权限校验，不含具体业务逻辑）。
 *
 * 校验规则：
 * - 读取 @Roles / @Permissions 声明的要求。
 * - 与 request.user（由 AuthGuard 注入）的 roles / permissions 比对。
 * - 角色满足其一即可（OR）；权限需全部满足（AND）。
 * - 若路由未声明任何要求，则视为已通过（只需登录）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明任何要求则放行
    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('缺少用户上下文，无法进行权限校验');
    }

    // 角色校验：满足其一即可
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles: string[] = user.roles || [];
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) {
        throw new ForbiddenException(
          `需要角色之一：${requiredRoles.join(', ')}`,
        );
      }
    }

    // 权限校验：需全部满足
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions: string[] = user.permissions || [];
      const hasAll = requiredPermissions.every((p) =>
        userPermissions.includes(p),
      );
      if (!hasAll) {
        throw new ForbiddenException(
          `需要全部权限：${requiredPermissions.join(', ')}`,
        );
      }
    }

    return true;
  }
}
