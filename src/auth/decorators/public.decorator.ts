import { SetMetadata } from '@nestjs/common';

/**
 * 公开接口元数据键
 * 被 @Public() 标记的路由将跳过 JwtAuthGuard 的认证
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() 装饰器
 *
 * 标记某个控制器或方法为公开访问，无需登录即可访问。
 * 例如登录接口、健康检查、Swagger 文档等。
 *
 * 用法：
 *   @Public()
 *   @Post('login')
 *   login() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
