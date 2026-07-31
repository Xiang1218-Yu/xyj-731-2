/**
 * 应用入口
 *
 * 启动 NestJS HTTP 服务，配置:
 *  - 全局路由前缀 /api
 *  - 全局 ValidationPipe（DTO 校验 + 白名单）
 *  - Swagger API 文档 (/api/docs)
 *  - CORS
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 记录所有请求日志（可按需关闭）
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  // 全局路由前缀
  app.setGlobalPrefix('api');

  // 全局 DTO 校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剥离 DTO 未声明的属性
      forbidNonWhitelisted: false, // 遇到未声明属性不报错（兼容性更好）
      transform: true, // 自动将请求体转换为 DTO 类型实例
    }),
  );

  // 启用 CORS（生产环境应按实际域名收敛）
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // ---------- Swagger API 文档配置 ----------
  const swaggerConfig = new DocumentBuilder()
    .setTitle('统一身份认证服务 API')
    .setDescription(
      '基于 NestJS 与策略模式实现的统一身份认证服务，支持 JWT、OAuth2.0、LDAP 三种认证策略，支持运行时动态切换、Redis 会话存储与框架层 RBAC 权限校验。',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: '输入登录获取的 access token',
        in: 'header',
      },
      'bearer',
    )
    .addTag('auth - 统一身份认证')
    .addTag('protected - 权限校验示例')
    .addTag('health - 健康检查')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // 文档访问地址: http://localhost:3000/api/docs
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 刷新页面后保留 token
    },
  });

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`服务已启动: http://localhost:${port}`);
  logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
}

bootstrap();
