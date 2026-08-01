import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * 应用启动入口。
 * - 开启全局校验管道（配合 class-validator）。
 * - 挂载 Swagger 文档到 /api-docs。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 全局参数校验：自动剔除多余字段、类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // ===== Swagger 文档配置 =====
  const swaggerConfig = new DocumentBuilder()
    .setTitle('统一身份认证服务 API')
    .setDescription(
      '基于 NestJS 的统一身份认证服务：支持 JWT / OAuth2.0 / LDAP 多策略、' +
        '策略模式运行时切换、Redis 会话存储、权限校验守卫与中间件。',
    )
    .setVersion('1.0.0')
    // 声明 Bearer 认证，Swagger UI 右上角可输入 token（使用默认名称，配合 @ApiBearerAuth()）
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const port = configService.get<number>('port');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`应用已启动：http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger 文档：http://localhost:${port}/api-docs`);
}

bootstrap().catch((err) => {
  // 启动失败（如 Redis 不可用且未开启降级）时，输出简洁的致命信息并退出，
  // 避免向终端抛出冗长且令人误解的底层堆栈。
  // eslint-disable-next-line no-console
  console.error(`服务启动失败：${err?.message || err}`);
  process.exit(1);
});
