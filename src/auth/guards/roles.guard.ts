import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../decorators/current-user.decorator';

/**
 * 角色权限守卫（框架层 RBAC）
 *
 * 配合 @Roles('admin', ...) 装饰器使用，在 JwtAuthGuard 之后执行：
 *  1. JwtAuthGuard 完成身份认证并挂载 request.user
 *  2. RolesGuard 读取路由要求的角色，与 request.user.payload.roles 比对
 *  3. 若用户拥有任一要求角色则放行，否则抛出 403
 *
 * 设计说明：
 *  - 这是框架层面的通用、无业务侵入的权限校验中间件/守卫。
 *  - 只做"角色"维度的校验，不涉及具体业务系统的资源权限。
 *  - 业务系统可继承或组合该守卫，扩展资源级/数据级权限。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 读取路由上声明的所需角色（方法级覆盖类级）
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明 @Roles() 表示该接口只要登录即可访问，不做角色限制
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user || !user.payload?.roles) {
      throw new ForbiddenException('无法获取用户角色信息');
    }

    const userRoles = user.payload.roles;
    // 只要拥有任一所需角色即放行
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `权限不足，需要以下角色之一: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
