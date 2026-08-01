import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import configuration from './config/configuration';

/**
 * 应用入口：创建 Nest 应用、注册全局管道、挂载 Swagger 文档
 */
async function bootstrap() {
  const config = configuration();
  const app = await NestFactory.create(AppModule);

  // 全局 DTO 校验管道：自动过滤未声明字段并做类型转换
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Swagger 文档配置，访问路径：/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('统一身份认证服务')
    .setDescription(
      '支持 JWT / OAuth2.0 / LDAP 三种认证策略，支持运行时动态切换，' +
        '提供统一登录 / 登出 / 刷新令牌接口，会话存储基于 Redis。',
    )
    .setVersion('1.0.0')
    // Bearer 认证方式，供 Swagger UI 中 Authorize 按钮使用
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.port);
  console.log(`[bootstrap] 服务已启动: http://localhost:${config.port}`);
  console.log(`[bootstrap] Swagger 文档: http://localhost:${config.port}/docs`);
}

bootstrap();
