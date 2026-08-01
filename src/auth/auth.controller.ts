import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './services/auth.service';
import { OAuth2Strategy } from './strategies/oauth2.strategy';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginResponseVo, TokenPairVo } from './dto/auth-response.vo';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { Permissions } from './decorators/permissions.decorator';
import { AuthGuard } from './guards/auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { randomUUID } from 'crypto';

/**
 * 认证控制器：对外提供统一的登录 / 登出 / 刷新令牌接口，
 * 以及若干用于演示权限守卫的受保护接口。
 */
@ApiTags('认证 Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauth2Strategy: OAuth2Strategy,
  ) {}

  /** 统一登录接口，支持通过 strategy 字段运行时切换认证方式 */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '统一登录',
    description:
      '支持 JWT / OAuth2 / LDAP 三种策略。通过 body.strategy 运行时动态切换；不传则用默认策略。',
  })
  @ApiResponse({ status: 200, description: '登录成功', type: LoginResponseVo })
  @ApiResponse({ status: 401, description: '认证失败' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseVo> {
    return this.authService.login(dto);
  }

  /** 统一登出接口：销毁当前会话 */
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '统一登出', description: '销毁当前会话，使令牌立即失效' })
  @ApiResponse({ status: 200, description: '登出成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  async logout(
    @CurrentUser('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    await this.authService.logout(sessionId);
    return { message: '登出成功' };
  }

  /** 刷新令牌接口：用 refresh token 换取新的令牌对 */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新令牌',
    description: '使用刷新令牌换取新的访问令牌与刷新令牌（刷新令牌轮换）',
  })
  @ApiResponse({ status: 200, description: '刷新成功', type: TokenPairVo })
  @ApiResponse({ status: 401, description: '刷新令牌无效或已过期' })
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ tokens: TokenPairVo }> {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 列出当前支持的认证策略 */
  @Public()
  @Get('strategies')
  @ApiOperation({ summary: '查询可用认证策略' })
  @ApiResponse({ status: 200, description: '返回可用策略列表' })
  getStrategies(): { strategies: string[] } {
    return { strategies: this.authService.getAvailableStrategies() };
  }

  /** 生成 OAuth2 授权跳转地址（授权码模式第一步） */
  @Public()
  @Get('oauth2/authorize-url')
  @ApiOperation({
    summary: '获取 OAuth2 授权跳转地址',
    description: '返回用于重定向到第三方授权服务器的 URL',
  })
  getOAuth2AuthorizeUrl(): { url: string; state: string } {
    const state = randomUUID();
    return { url: this.oauth2Strategy.getAuthorizationUrl(state), state };
  }

  /** 获取当前登录用户信息（需登录） */
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: '获取当前用户信息', description: '需要有效的访问令牌' })
  @ApiResponse({ status: 200, description: '返回当前用户信息' })
  @ApiResponse({ status: 401, description: '未认证' })
  getProfile(@CurrentUser() user: unknown): unknown {
    return user;
  }

  /** 演示：需要 admin 角色的受保护接口 */
  @UseGuards(AuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin-only')
  @ApiOperation({
    summary: '仅管理员可访问（角色守卫演示）',
    description: '演示 @Roles + PermissionGuard 的角色校验',
  })
  @ApiResponse({ status: 200, description: '访问成功' })
  @ApiResponse({ status: 403, description: '权限不足' })
  adminOnly(@CurrentUser('username') username: string): { message: string } {
    return { message: `你好管理员 ${username}，你已通过角色校验` };
  }

  /** 演示：需要 user:write 权限的受保护接口 */
  @UseGuards(AuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @Permissions('user:write')
  @Get('need-permission')
  @ApiOperation({
    summary: '需要 user:write 权限（权限守卫演示）',
    description: '演示 @Permissions + PermissionGuard 的细粒度权限校验',
  })
  @ApiResponse({ status: 200, description: '访问成功' })
  @ApiResponse({ status: 403, description: '权限不足' })
  needPermission(): { message: string } {
    return { message: '你拥有 user:write 权限，校验通过' };
  }
}
