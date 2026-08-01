import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 当前用户信息
 *
 * 由 JwtAuthGuard 校验通过后挂载到 request.user 上。
 * 包含 JWT 载荷与对应会话信息。
 */
export interface RequestUser {
  /** JWT 载荷 */
  payload: {
    sub: string;
    userId: string;
    username: string;
    roles: string[];
    type: string;
  };
  /** Redis 中的会话记录 */
  session: {
    sessionId: string;
    userId: string;
    username: string;
    roles: string[];
    strategy: string;
  };
}

/**
 * @CurrentUser() 参数装饰器
 *
 * 用法：
 *   @Get('profile')
 *   @UseGuards(JwtAuthGuard)
 *   getProfile(@CurrentUser() user: RequestUser) { ... }
 *
 * 支持传入属性路径：@CurrentUser('payload.username')
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) return undefined;
    if (!data) return user;
    // 支持点号路径，如 'payload.username'
    return (data as string).split('.').reduce((obj: any, key) => obj?.[key], user);
  },
);
