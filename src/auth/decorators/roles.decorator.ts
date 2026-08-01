import { SetMetadata } from '@nestjs/common';

/**
 * 角色要求元数据键
 * RolesGuard 通过该键读取路由处理函数上声明的角色列表
 */
export const ROLES_KEY = 'roles';

/**
 * @Roles(...) 装饰器
 *
 * 框架层 RBAC（基于角色的访问控制）声明方式。
 * 在控制器方法上标注访问该接口所需的角色，由 RolesGuard 统一校验。
 *
 * 用法：
 *   @Get('admin')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   onlyAdmin() { ... }
 *
 * 注意：这是框架层面的通用权限校验，不绑定任何具体业务系统。
 * 业务系统可在此基础上扩展更细粒度的权限模型。
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
