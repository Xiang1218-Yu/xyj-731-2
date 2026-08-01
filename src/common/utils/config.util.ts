/**
 * 配置读取工具
 *
 * 统一封装从 ConfigService 读取并校验配置项的逻辑，
 * 避免在各服务中散落非空断言（!）或重复编写校验代码。
 *
 * 所有 "必填" 配置项都应通过本工具读取，缺失或非法时抛出 ConfigurationException，
 * 从而在错误发生的第一时间暴露配置问题，而非产生难以定位的隐性运行时错误。
 */
import { ConfigService } from '@nestjs/config';
import { ConfigurationException } from '../exceptions/configuration.exception';

/**
 * 读取必填的字符串配置项。
 * @throws ConfigurationException 当配置项缺失、为 null 或为空字符串时
 */
export function getRequiredString(
  config: ConfigService,
  key: string,
): string {
  const value = config.get<string>(key);
  if (value === undefined || value === null || `${value}`.trim() === '') {
    throw new ConfigurationException(`缺少必要配置项: ${key}`);
  }
  return value;
}

/**
 * 读取必填的数值配置项。
 * @param options.min 可选最小值（含）
 * @param options.max 可选最大值（含）
 * @throws ConfigurationException 当配置项缺失、非有限数值或超出范围时
 */
export function getRequiredNumber(
  config: ConfigService,
  key: string,
  options?: { min?: number; max?: number },
): number {
  const value = config.get<number>(key);
  if (
    value === undefined ||
    value === null ||
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new ConfigurationException(
      `缺少必要配置项或值非法(应为数字): ${key}`,
    );
  }
  if (options?.min !== undefined && value < options.min) {
    throw new ConfigurationException(
      `配置项 ${key} 的值 ${value} 小于最小值 ${options.min}`,
    );
  }
  if (options?.max !== undefined && value > options.max) {
    throw new ConfigurationException(
      `配置项 ${key} 的值 ${value} 大于最大值 ${options.max}`,
    );
  }
  return value;
}

/**
 * 读取必填的布尔配置项。
 * ConfigService 中布尔值通常来自字符串环境变量，这里兼容字符串/布尔两种类型。
 * @throws ConfigurationException 当配置项缺失或无法解析为布尔值时
 */
export function getRequiredBoolean(
  config: ConfigService,
  key: string,
): boolean {
  const value = config.get<boolean | string>(key);
  if (value === undefined || value === null || `${value}`.trim() === '') {
    throw new ConfigurationException(`缺少必要配置项: ${key}`);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = `${value}`.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new ConfigurationException(
    `配置项 ${key} 的值 "${value}" 无法解析为布尔值，应为 true 或 false`,
  );
}

/**
 * 读取可选的字符串配置项。配置缺失时返回 undefined（而非抛出异常）。
 * 适用于 Redis 密码等本身允许为空的配置。
 */
export function getOptionalString(
  config: ConfigService,
  key: string,
): string | undefined {
  const value = config.get<string>(key);
  if (value === undefined || value === null || `${value}`.trim() === '') {
    return undefined;
  }
  return value;
}

/**
 * 校验时长格式，必须为 "15m" / "7d" / "3600s" 或纯数字秒。
 * @returns 校验通过后的原始字符串（已 trim）
 * @throws ConfigurationException 当格式非法时
 */
export function validateDuration(value: string, configKey: string): string {
  const trimmed = value.trim();
  if (!/^\d+[smhd]$|^\d+$/.test(trimmed)) {
    throw new ConfigurationException(
      `${configKey} 格式非法: "${value}"，应为形如 15m / 7d / 3600s 的时长或数字秒`,
    );
  }
  return trimmed;
}
