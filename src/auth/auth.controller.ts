import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, SwitchStrategyDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';

/**
 * 统一认证控制器
 * 对外提供：登录 / 登出 / 刷新令牌 / 策略查询与切换 / 受保护示例接口
 */
@ApiTags('认证服务')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 统一登录接口（公开）
   * 根据当前生效策略（或请求中显式指定的策略）完成认证
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '统一登录', description: '支持 jwt / oauth2 / ldap 三种策略，可用 strategy 字段指定本次登录策略' })
  @ApiResponse({ status: 200, description: '登录成功，返回访问令牌与刷新令牌' })
  @ApiResponse({ status: 401, description: '认证失败' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto, dto.strategy);
  }

  /**
   * 统一登出接口
   * 删除服务端会话，使当前访问令牌与刷新令牌立即失效
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '统一登出' })
  @ApiResponse({ status: 204, description: '登出成功' })
  @ApiResponse({ status: 400, description: '缺少会话标识' })
  @ApiResponse({ status: 401, description: '未认证或会话已失效' })
  @ApiResponse({ status: 404, description: '会话不存在或已过期' })
  async logout(@Request() req) {
    // 空值兜底：守卫异常放行时也能得到友好提示而非 500
    await this.authService.logout(req.user?.sessionId);
  }

  /**
   * 统一刷新令牌接口（公开）
   * 使用刷新令牌换取新的访问令牌（令牌轮换）
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新访问令牌', description: '刷新令牌轮换：旧刷新令牌随即失效' })
  @ApiResponse({ status: 200, description: '刷新成功' })
  @ApiResponse({ status: 401, description: '刷新令牌无效或已过期' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * 查询当前认证策略状态（公开，便于集成方探测）
   */
  @Public()
  @Get('strategy')
  @ApiOperation({ summary: '查询当前认证策略' })
  @ApiResponse({ status: 200, description: '返回当前生效策略与全部可用策略' })
  getStrategy() {
    return this.authService.getStrategyStatus();
  }

  /**
   * 运行时动态切换认证策略
   * 需要 auth:strategy:switch 权限（演示账号 admin 具备）
   */
  @Post('strategy')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermissions('auth:strategy:switch')
  @ApiOperation({ summary: '切换认证策略', description: '运行时动态切换全局认证策略，需要 auth:strategy:switch 权限' })
  @ApiResponse({ status: 200, description: '切换成功' })
  @ApiResponse({ status: 400, description: '不支持的策略名' })
  @ApiResponse({ status: 403, description: '权限不足' })
  switchStrategy(@Body() dto: SwitchStrategyDto) {
    return this.authService.switchStrategy(dto.strategy);
  }

  /**
   * 当前登录用户信息（演示受保护接口）
   */
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({ status: 200, description: '返回当前登录用户信息' })
  @ApiResponse({ status: 401, description: '未认证' })
  getProfile(@Request() req) {
    return req.user;
  }

  /**
   * 管理端示例接口：演示权限校验（需要 admin:access 权限）
   */
  @Get('admin-only')
  @ApiBearerAuth()
  @RequirePermissions('admin:access')
  @ApiOperation({ summary: '管理端示例接口', description: '仅具备 admin:access 权限的用户可访问' })
  @ApiResponse({ status: 200, description: '访问成功' })
  @ApiResponse({ status: 403, description: '权限不足' })
  adminOnly() {
    return { message: '你拥有 admin:access 权限，访问成功' };
  }
}
