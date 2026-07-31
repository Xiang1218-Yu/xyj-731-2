import { SetMetadata } from '@nestjs/common';

/** 元数据 key：路由所需权限 */
export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * @Permissions('user:read') 装饰器。
 * 声明访问某路由所需的细粒度权限，由 PermissionGuard 校验。
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
