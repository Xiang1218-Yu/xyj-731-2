import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * 应用启动入口
 *
 * 职责：
 *  1. 创建 Nest 应用
 *  2. 启用全局路由前缀与请求参数校验管道
 *  3. 配置 Swagger API 文档（访问 /docs）
 *  4. 启动 HTTP 服务
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  // 全局路由前缀，例如 http://localhost:3000/api/auth/login
  const prefix = config.get<string>('app.prefix') || 'api';
  app.setGlobalPrefix(prefix);

  // 全局校验管道：基于 class-validator 自动校验 DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剥离未声明的属性
      transform: true, // 自动类型转换
      forbidNonWhitelisted: false,
    }),
  );

  // 配置 Swagger 文档
  const swaggerConfig = new DocumentBuilder()
    .setTitle('统一身份认证服务 API')
    .setDescription(
      '基于 NestJS 的统一身份认证服务，支持 JWT、OAuth2.0、LDAP 三种认证策略，' +
        '支持运行时动态切换策略，提供统一的登录/登出/刷新令牌接口、框架层 RBAC 权限校验，' +
        '以及基于 Redis 的会话存储。',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: '输入登录获取的 accessToken（无需加 Bearer 前缀）',
        in: 'header',
      },
      'access-token',
    )
    .addTag('统一认证')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      // 文档页面默认展开，方便调试
      docExpansion: 'list',
      persistAuthorization: true,
    },
  });

  const port = config.get<number>('app.port') || 3000;
  await app.listen(port);

  logger.log(`应用已启动: http://localhost:${port}/${prefix}`);
  logger.log(`Swagger 文档: http://localhost:${port}/docs`);
  logger.log(
    `当前默认认证策略: ${config.get<string>('app.defaultStrategy')}`,
  );
}

bootstrap();
