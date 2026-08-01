import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/**
 * @CurrentUser() 参数装饰器。
 * 从请求对象中取出 AuthGuard 注入的当前用户信息，方便控制器直接使用。
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    // 支持 @CurrentUser('userId') 取单个字段
    return data ? user?.[data] : user;
  },
);
