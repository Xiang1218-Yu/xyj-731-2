import { SetMetadata } from '@nestjs/common';

/** 公开接口元数据 key */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记接口为公开访问（跳过 JWT 认证守卫）
 * 例如登录、刷新令牌接口
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
