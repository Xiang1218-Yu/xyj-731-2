/**
 * 认证控制器
 *
 * 提供统一身份认证的 RESTful 接口:
 *  - POST   /api/auth/login          登录（支持动态选择认证方式）
 *  - POST   /api/auth/logout         登出（销毁会话）
 *  - POST   /api/auth/refresh        刷新令牌
 *  - GET    /api/auth/types          获取支持的认证方式列表
 *  - GET    /api/auth/oauth2/authorize  获取 OAuth2 授权跳转地址
 *  - GET    /api/auth/oauth2/callback   OAuth2 回调入口
 *  - GET    /api/auth/profile        获取当前用户信息（需登录）
 */
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuth2Strategy } from './strategies/oauth2.strategy';

@ApiTags('auth - 统一身份认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauth2Strategy: OAuth2Strategy,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: '统一登录',
    description:
      '根据 authType 动态选择认证策略。jwt/ldap 传 username+password; oauth2 可传 code 或 accessToken 或 username+password(密码模式/本地回退)。',
  })
  @ApiResponse({ status: 201, description: '登录成功', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: '认证失败' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: '登出', description: '校验 refreshToken 并销毁对应会话' })
  @ApiResponse({ status: 201, description: '登出成功' })
  @ApiResponse({ status: 401, description: '令牌无效' })
  async logout(@Body() dto: RefreshTokenDto): Promise<{ success: boolean }> {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: '刷新令牌',
    description: '使用 refreshToken 换取新的 accessToken / refreshToken（滑动续期）',
  })
  @ApiResponse({ status: 201, description: '刷新成功', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'refreshToken 无效或会话已失效' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Get('types')
  @ApiOperation({ summary: '获取支持的认证方式列表' })
  @ApiResponse({ status: 200, description: '支持的认证类型' })
  getAuthTypes(): { types: string[] } {
    return { types: this.authService.getSupportedAuthTypes() };
  }

  @Public()
  @Get('oauth2/authorize')
  @ApiOperation({
    summary: '获取 OAuth2 授权跳转地址',
    description: '前端引导用户跳转到返回的 URL，在第三方完成授权后回调 callback 接口',
  })
  @ApiQuery({ name: 'state', required: false, description: '防 CSRF 的随机串' })
  getAuthorizeUrl(@Query('state') state?: string): { authorizeUrl: string } {
    const stateValue = state || Math.random().toString(36).slice(2);
    return { authorizeUrl: this.oauth2Strategy.getAuthorizeUrl(stateValue) };
  }

  @Public()
  @Get('oauth2/callback')
  @ApiOperation({
    summary: 'OAuth2 授权回调',
    description: '第三方授权服务器回调本接口，使用 code 完成登录并返回令牌',
  })
  @ApiQuery({ name: 'code', required: true, description: '授权码' })
  @ApiQuery({ name: 'state', required: false, description: '防 CSRF 随机串' })
  async oauth2Callback(
    @Query('code') code: string,
    @Query('state') state?: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login({
      authType: 'oauth2' as any,
      code,
      state,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: '获取当前登录用户信息' })
  @ApiResponse({ status: 200, description: '当前用户信息' })
  @ApiResponse({ status: 401, description: '未登录或令牌无效' })
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
