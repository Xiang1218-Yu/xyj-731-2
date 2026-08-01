/**
 * 配置异常
 *
 * 当应用缺少必要配置项或配置值格式非法时抛出。
 * 启动期抛出会中止应用启动；请求期抛出会返回 500，
 * 便于调用方快速定位配置问题，而非产生难以排查的隐性故障。
 */
import { InternalServerErrorException } from '@nestjs/common';

export class ConfigurationException extends InternalServerErrorException {
  constructor(message: string) {
    super(`配置错误: ${message}`);
  }
}
