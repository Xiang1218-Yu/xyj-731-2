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
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SetStrategyDto } from './dto/set-strategy.dto';
import {
  LoginResponseDto,
  StrategyInfoDto,
} from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';

/**
 * 统一认证控制器
 *
 * 提供认证相关的全部 HTTP 接口：
 *  - POST   /auth/login              登录（任意策略）
 *  - POST   /auth/refresh            刷新令牌
 *  - POST   /auth/logout             登出
 *  - GET    /auth/me                 获取当前登录用户信息
 *  - GET    /auth/oauth2/authorize   获取 OAuth2 授权地址
 *  - GET    /auth/strategy           查询当前与可用认证策略
 *  - PUT    /auth/strategy           运行时动态切换默认认证策略（需 admin 角色）
 *  - GET    /auth/admin/info         框架层 RBAC 演示接口（需 admin 角色）
 */
@ApiTags('统一认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '统一登录',
    description:
      '支持 JWT / OAuth2 / LDAP 三种认证策略。可在请求体中通过 strategy 字段单次指定策略，不传则使用系统当前默认策略。',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '登录成功',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: '认证失败' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新令牌',
    description:
      '使用长期有效的 refreshToken 换取新的 accessToken / refreshToken（refresh token rotation）。',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '刷新成功',
    type: LoginResponseDto,
  })
  async refresh(@Body() dto: RefreshDto): Promise<LoginResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '登出',
    description: '销毁当前会话，使该 accessToken / refreshToken 立即失效。',
  })
  @ApiResponse({ status: HttpStatus.OK, description: '登出成功' })
  async logout(@CurrentUser() user: RequestUser) {
    await this.authService.logout(user.session.sessionId);
    return { success: true, message: '已登出' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('me')
  @ApiOperation({
    summary: '获取当前登录用户信息',
    description: '从 accessToken 中解析并返回当前用户主体与会话信息。',
  })
  me(@CurrentUser() user: RequestUser) {
    return {
      userId: user.payload.userId,
      username: user.payload.username,
      roles: user.payload.roles,
      strategy: user.session.strategy,
      sessionId: user.session.sessionId,
    };
  }

  @Public()
  @Get('oauth2/authorize')
  @ApiOperation({
    summary: '获取 OAuth2 授权地址',
    description:
      '返回 OAuth2 授权服务器的授权 URL，前端拿到后重定向用户到该地址完成第三方授权。',
  })
  getOAuth2AuthorizeUrl() {
    return { authorizeUrl: this.authService.getOAuth2AuthorizeUrl() };
  }

  @Public()
  @Get('strategy')
  @ApiOperation({
    summary: '查询认证策略',
    description: '返回系统当前默认认证策略以及所有可用策略。',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '查询成功',
    type: StrategyInfoDto,
  })
  getStrategy(): StrategyInfoDto {
    const info = this.authService.getStrategyInfo();
    return { current: info.current, available: info.available };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('strategy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '动态切换默认认证策略',
    description:
      '运行时切换系统默认认证策略（仅 admin 角色可用）。切换后，未显式指定 strategy 的登录请求将使用新策略。',
  })
  @ApiResponse({ status: HttpStatus.OK, description: '切换成功' })
  setStrategy(@Body() dto: SetStrategyDto): StrategyInfoDto {
    const info = this.authService.setStrategy(dto.strategy);
    return { current: info.current, available: info.available };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/info')
  @ApiOperation({
    summary: '管理员接口（RBAC 演示）',
    description: '该接口需要 admin 角色，用于演示框架层角色权限校验。',
  })
  adminInfo(@CurrentUser() user: RequestUser) {
    return {
      message: '这是仅管理员可访问的接口',
      user: user.payload.username,
      roles: user.payload.roles,
    };
  }
}
