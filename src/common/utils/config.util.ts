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
 * @throws ConfigurationException 当配置项缺失、非有限数值时
 */
export function getRequiredNumber(
  config: ConfigService,
  key: string,
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
