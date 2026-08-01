import { SetMetadata } from '@nestjs/common';

/** 元数据 key：路由所需角色 */
export const ROLES_KEY = 'requiredRoles';

/**
 * @Roles('admin', 'user') 装饰器。
 * 声明访问某路由所需的角色，由 PermissionGuard 校验。
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
