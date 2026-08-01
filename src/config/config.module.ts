import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import {
  appConfig,
  jwtConfig,
  ldapConfig,
  oauth2Config,
  redisConfig,
} from './app.config';

/**
 * 配置模块
 *
 * 统一加载 .env 并注册各命名空间配置。设置 isGlobal: true，
 * 业务模块无需重复 import 即可注入 ConfigService / ConfigType。
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, jwtConfig, oauth2Config, ldapConfig, redisConfig],
    }),
  ],
})
export class AppConfigModule {}
