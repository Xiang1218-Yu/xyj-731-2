/**
 * JWT 认证守卫
 *
 * 继承 Passport 的 AuthGuard('jwt-passport')，校验请求携带的 access token。
 * 支持通过 @Public() 装饰器标注公开接口，跳过认证。
 *
 * 该守卫可在控制器/方法上使用 @UseGuards(JwtAuthGuard)，
 * 也可在全局注册（APP_GUARD）实现默认所有接口都需要登录。
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-passport') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 检查接口是否被 @Public() 标注，若是则直接放行
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    // 否则执行 Passport JWT 校验
    return super.canActivate(context);
  }
}
