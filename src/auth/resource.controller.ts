/**
 * 受保护资源示例控制器
 *
 * 该控制器仅用于演示框架层的认证与权限校验中间件如何使用，
 * 不涉及具体业务逻辑。真实业务系统可参照此模式编写自己的控制器。
 *
 * 接口说明:
 *  - GET /api/resources/public     公开接口，无需登录
 *  - GET /api/resources/profile    任意登录用户可访问
 *  - GET /api/resources/editor     需要 editor 或 admin 角色
 *  - GET /api/resources/admin      仅 admin 角色可访问
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('protected - 权限校验示例')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('resources')
export class ResourceController {
  @Public()
  @Get('public')
  @ApiOperation({ summary: '公开接口，无需登录' })
  getPublic() {
    return { message: '这是公开数据，任何人都可以访问' };
  }

  @Get('profile')
  @ApiOperation({ summary: '需要登录，任意角色可访问' })
  @ApiResponse({ status: 200, description: '返回当前用户信息' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: '这是登录后的数据',
      user,
    };
  }

  @Roles('editor', 'admin')
  @Get('editor')
  @ApiOperation({ summary: '需要 editor 或 admin 角色' })
  @ApiResponse({ status: 200, description: '编辑者数据' })
  @ApiResponse({ status: 403, description: '角色不足' })
  getEditorData(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: '这是编辑者数据',
      user: user.username,
    };
  }

  @Roles('admin')
  @Get('admin')
  @ApiOperation({ summary: '仅 admin 角色可访问' })
  @ApiResponse({ status: 200, description: '管理员数据' })
  @ApiResponse({ status: 403, description: '需要管理员权限' })
  getAdminData(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: '这是管理员专属数据',
      user: user.username,
    };
  }
}
