/**
 * 角色声明装饰器
 *
 * 用于在控制器方法上标注访问该接口所需的角色列表。
 * 与 RolesGuard 配合使用，实现框架层基于角色的访问控制（RBAC）。
 *
 * @example
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   @Get('admin-only')
 *   findAll() { ... }
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
