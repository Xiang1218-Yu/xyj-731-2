import { SetMetadata } from '@nestjs/common';

/** 元数据 key：标记路由为公开（无需认证） */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() 装饰器。
 * 标注在控制器方法上，使 AuthGuard 跳过认证（如登录、刷新接口）。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
