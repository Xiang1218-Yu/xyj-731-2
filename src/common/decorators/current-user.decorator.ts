/**
 * 当前用户参数装饰器
 *
 * 用于在控制器方法中快速获取当前登录用户对象，
 * 数据来源为 JwtAuthGuard 校验通过后挂载到 request.user 上的 AuthenticatedUser。
 *
 * @example
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) {
 *     return user;
 *   }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    // 如果指定了字段，则返回该字段，否则返回整个用户对象
    return data ? user?.[data] : user;
  },
);
