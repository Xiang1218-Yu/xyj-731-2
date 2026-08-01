/**
 * 角色权限守卫（框架层 RBAC）
 *
 * 读取 @Roles(...) 装饰器声明的所需角色，与当前登录用户的角色进行比对。
 * 仅当用户拥有至少一个所需角色时才允许访问。
 *
 * 该守卫只提供框架层面的通用权限校验，不涉及具体业务权限。
 * 业务系统可在此基础上扩展资源级、数据级权限。
 *
 * 使用方式:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   @Get('admin')
 *   adminOnly() { ... }
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取接口声明的所需角色列表
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明 @Roles() 则不做角色限制，直接放行
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user || !user.roles || user.roles.length === 0) {
      throw new ForbiddenException('当前用户无任何角色，访问被拒绝');
    }

    // 用户拥有任意一个所需角色即放行
    const hasRole = user.roles.some((role) =>
      requiredRoles.includes(role),
    );
    if (!hasRole) {
      throw new ForbiddenException(
        `访问被拒绝，需要以下角色之一: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
