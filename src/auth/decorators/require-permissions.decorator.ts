import { SetMetadata } from '@nestjs/common';

/** 接口所需权限的元数据 key */
export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * 声明接口访问所需权限（具备任一权限即可访问）
 * 与全局 PermissionsGuard 配合使用
 * @example @RequirePermissions('admin:access')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
