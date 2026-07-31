/**
 * 公开接口装饰器
 *
 * 当全局启用 JwtAuthGuard 时，默认所有接口都需要登录。
 * 使用 @Public() 标注的接口将跳过 JWT 认证，例如登录、Swagger、健康检查等。
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
