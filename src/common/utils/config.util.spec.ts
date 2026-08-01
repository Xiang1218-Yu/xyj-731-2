/**
 * config.util 单元测试
 *
 * 覆盖共享配置读取工具的所有分支:
 *  - getRequiredString: 正常返回、缺失/空值抛异常
 *  - getRequiredNumber: 正常返回、缺失/非数字抛异常、范围校验
 *  - getRequiredBoolean: 字符串/布尔解析、非法值抛异常
 *  - getOptionalString: 有值返回、空值返回 undefined
 *  - validateDuration: 合法格式通过、非法格式抛异常
 */
import { ConfigService } from '@nestjs/config';
import {
  getOptionalString,
  getRequiredBoolean,
  getRequiredNumber,
  getRequiredString,
  validateDuration,
} from './config.util';

/**
 * 构造一个内存版 ConfigService mock，避免依赖 Nest 容器
 */
function mockConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('config.util', () => {
  describe('getRequiredString', () => {
    it('配置存在时应返回字符串值', () => {
      const config = mockConfig({ 'jwt.secret': 'my-secret-value' });
      expect(getRequiredString(config, 'jwt.secret')).toBe('my-secret-value');
    });

    it('值为 undefined 时应抛出 ConfigurationException', () => {
      const config = mockConfig({});
      expect(() => getRequiredString(config, 'jwt.secret')).toThrow(
        /缺少必要配置项: jwt\.secret/,
      );
    });

    it('值为 null 时应抛出异常', () => {
      const config = mockConfig({ 'jwt.secret': null });
      expect(() => getRequiredString(config, 'jwt.secret')).toThrow(
        /缺少必要配置项/,
      );
    });

    it('值为空字符串时应抛出异常', () => {
      const config = mockConfig({ 'jwt.secret': '   ' });
      expect(() => getRequiredString(config, 'jwt.secret')).toThrow(
        /缺少必要配置项/,
      );
    });
  });

  describe('getRequiredNumber', () => {
    it('配置存在且为数字时应返回数值', () => {
      const config = mockConfig({ port: 3000 });
      expect(getRequiredNumber(config, 'port')).toBe(3000);
    });

    it('值为 undefined 时应抛出异常', () => {
      const config = mockConfig({});
      expect(() => getRequiredNumber(config, 'port')).toThrow(
        /缺少必要配置项或值非法/,
      );
    });

    it('值为 NaN 时应抛出异常', () => {
      const config = mockConfig({ port: NaN });
      expect(() => getRequiredNumber(config, 'port')).toThrow(
        /缺少必要配置项或值非法/,
      );
    });

    it('值小于 min 时应抛出范围异常', () => {
      const config = mockConfig({ db: -1 });
      expect(() =>
        getRequiredNumber(config, 'db', { min: 0, max: 15 }),
      ).toThrow(/小于最小值 0/);
    });

    it('值大于 max 时应抛出范围异常', () => {
      const config = mockConfig({ db: 16 });
      expect(() =>
        getRequiredNumber(config, 'db', { min: 0, max: 15 }),
      ).toThrow(/大于最大值 15/);
    });

    it('值在合法范围内应正常返回', () => {
      const config = mockConfig({ db: 5 });
      expect(
        getRequiredNumber(config, 'db', { min: 0, max: 15 }),
      ).toBe(5);
    });
  });

  describe('getRequiredBoolean', () => {
    it('字符串 "true" 应解析为 true', () => {
      const config = mockConfig({ enabled: 'true' });
      expect(getRequiredBoolean(config, 'enabled')).toBe(true);
    });

    it('字符串 "false" 应解析为 false', () => {
      const config = mockConfig({ enabled: 'false' });
      expect(getRequiredBoolean(config, 'enabled')).toBe(false);
    });

    it('布尔值 true 应直接返回 true', () => {
      const config = mockConfig({ enabled: true });
      expect(getRequiredBoolean(config, 'enabled')).toBe(true);
    });

    it('布尔值 false 应直接返回 false', () => {
      const config = mockConfig({ enabled: false });
      expect(getRequiredBoolean(config, 'enabled')).toBe(false);
    });

    it('值缺失时应抛出异常', () => {
      const config = mockConfig({});
      expect(() => getRequiredBoolean(config, 'enabled')).toThrow(
        /缺少必要配置项: enabled/,
      );
    });

    it('值为无法识别的字符串时应抛出异常', () => {
      const config = mockConfig({ enabled: 'yes' });
      expect(() => getRequiredBoolean(config, 'enabled')).toThrow(
        /无法解析为布尔值/,
      );
    });
  });

  describe('getOptionalString', () => {
    it('配置存在时应返回值', () => {
      const config = mockConfig({ password: 'secret' });
      expect(getOptionalString(config, 'password')).toBe('secret');
    });

    it('配置缺失时应返回 undefined', () => {
      const config = mockConfig({});
      expect(getOptionalString(config, 'password')).toBeUndefined();
    });

    it('配置为空字符串时应返回 undefined', () => {
      const config = mockConfig({ password: '' });
      expect(getOptionalString(config, 'password')).toBeUndefined();
    });
  });

  describe('validateDuration', () => {
    it.each([
      ['15m', '15m'],
      ['7d', '7d'],
      ['3600s', '3600s'],
      ['2h', '2h'],
      ['900', '900'],
      [' 15m ', '15m'],
    ])('合法时长 "%s" 应通过校验并返回 trim 后的值', (input, expected) => {
      expect(validateDuration(input, 'test.duration')).toBe(expected);
    });

    it.each([
      ['abc'],
      ['15x'],
      ['m15'],
      [''],
      ['1.5m'],
      ['-5m'],
      ['15min'],
    ])('非法时长 "%s" 应抛出异常', (input) => {
      expect(() => validateDuration(input, 'test.duration')).toThrow(
        /格式非法/,
      );
    });
  });
});
