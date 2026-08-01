/**
 * Passport JWT 策略
 *
 * 注意命名区分:
 *  - strategies/jwt.strategy.ts 中的 JwtStrategy 负责"登录时校验用户名密码";
 *  - 本文件中的 JwtPassportStrategy 负责"请求携带 JWT 时校验令牌并加载用户"。
 *
 * 该策略从 Authorization: Bearer <token> 中提取并校验 access token，
 * 然后委托 AuthService 校验会话有效性，最终将用户信息挂载到 request.user。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getRequiredString } from '../../common/utils/config.util';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthService } from '../auth.service';

interface JwtPayload {
  sub: string;
  username: string;
  roles: string[];
  authType: string;
  sessionId: string;
  type: string;
}

@Injectable()
export class JwtPassportStrategy extends PassportStrategy(
  Strategy,
  'jwt-passport',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      // 从 Authorization Bearer 头中提取 token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不在这里忽略过期，交给校验逻辑统一处理
      ignoreExpiration: false,
      // 显式校验密钥与签发者配置存在性，不使用非空断言
      secretOrKey: getRequiredString(configService, 'jwt.secret'),
      issuer: getRequiredString(configService, 'jwt.issuer'),
    });
  }

  /**
   * Passport 校验通过后调用，payload 为已解码的 JWT 载荷
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('令牌类型错误，请使用 access token');
    }
    // 委托 AuthService 校验会话有效性（支持服务端登出/踢人）
    return this.authService.validateAccessToken(payload as any);
  }
}
