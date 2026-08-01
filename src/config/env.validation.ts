/**
 * 环境变量配置校验
 *
 * 应用启动时通过 ConfigModule 的 validate 钩子执行。
 * 使用 class-validator 对原始环境变量（均为字符串）做必填性与格式校验，
 * 校验失败会直接中止应用启动并打印明确的错误信息，避免错误配置流入运行期。
 *
 * 设计说明:
 *  - 可选变量仅在"被设置"时校验格式，未设置则由 configuration.ts 提供默认值;
 *  - 生产环境(NODE_ENV=production)对 JWT_SECRET 等敏感配置有更严格的强制要求;
 *  - 数值型端口/TTL 同时校验取值范围。
 */
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** 已知的不安全默认密钥，生产环境禁止使用 */
const INSECURE_JWT_SECRETS = new Set([
  'dev-insecure-secret-change-me',
  'please-change-this-secret-in-production',
  'change-me',
  'secret',
]);

/** 时长格式: 纯数字(秒) 或 数字+s/m/h/d 单位，例如 3600 / 15m / 7d */
const DURATION_REGEX = /^\d+[smhd]?$/;

class EnvironmentVariables {
  // ---------- 通用 ----------
  @IsOptional()
  @IsIn(['development', 'production', 'test'], {
    message: 'NODE_ENV 必须为 development / production / test 之一',
  })
  NODE_ENV?: string;

  @IsOptional()
  @IsPort({ message: 'PORT 必须为 1-65535 的合法端口' })
  PORT?: string;

  @IsOptional()
  @IsIn(['true', 'false'], {
    message: 'ALLOW_LOCAL_FALLBACK 必须为 true 或 false',
  })
  ALLOW_LOCAL_FALLBACK?: string;

  // ---------- JWT ----------
  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'JWT_SECRET 长度至少 16 个字符' })
  JWT_SECRET?: string;

  @IsOptional()
  @Matches(DURATION_REGEX, {
    message: 'JWT_EXPIRES_IN 格式非法，应为 15m / 7d / 3600s 或数字秒',
  })
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @Matches(DURATION_REGEX, {
    message: 'JWT_REFRESH_EXPIRES_IN 格式非法，应为 15m / 7d / 3600s 或数字秒',
  })
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsString({ message: 'JWT_ISSUER 必须为非空字符串' })
  JWT_ISSUER?: string;

  // ---------- Redis ----------
  @IsOptional()
  @IsString({ message: 'REDIS_HOST 必须为非空字符串' })
  REDIS_HOST?: string;

  @IsOptional()
  @IsPort({ message: 'REDIS_PORT 必须为 1-65535 的合法端口' })
  REDIS_PORT?: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsInt({ message: 'REDIS_DB 必须为整数' })
  @Min(0, { message: 'REDIS_DB 不能小于 0' })
  @Max(15, { message: 'REDIS_DB 不能大于 15' })
  REDIS_DB?: number;

  @IsOptional()
  @IsString({ message: 'REDIS_KEY_PREFIX 必须为非空字符串' })
  REDIS_KEY_PREFIX?: string;

  @IsOptional()
  @IsInt({ message: 'SESSION_TTL 必须为整数秒' })
  @Min(1, { message: 'SESSION_TTL 必须大于 0' })
  SESSION_TTL?: number;

  @IsOptional()
  @IsIn(['true', 'false'], {
    message: 'REDIS_FALLBACK_MEMORY 必须为 true 或 false',
  })
  REDIS_FALLBACK_MEMORY?: string;

  // ---------- OAuth2.0 ----------
  @IsOptional()
  @IsUrl(
    {
      require_tld: false, // 允许 localhost / 内网地址
      require_protocol: true,
      protocols: ['http', 'https'],
    },
    { message: 'OAUTH2_AUTHORIZATION_URL 必须为合法的 http(s) URL' },
  )
  OAUTH2_AUTHORIZATION_URL?: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'OAUTH2_TOKEN_URL 必须为合法的 http(s) URL' },
  )
  OAUTH2_TOKEN_URL?: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'OAUTH2_USERINFO_URL 必须为合法的 http(s) URL' },
  )
  OAUTH2_USERINFO_URL?: string;

  @IsOptional()
  @IsString({ message: 'OAUTH2_CLIENT_ID 必须为非空字符串' })
  OAUTH2_CLIENT_ID?: string;

  @IsOptional()
  @IsString({ message: 'OAUTH2_CLIENT_SECRET 必须为非空字符串' })
  OAUTH2_CLIENT_SECRET?: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'OAUTH2_CALLBACK_URL 必须为合法的 http(s) URL' },
  )
  OAUTH2_CALLBACK_URL?: string;

  @IsOptional()
  @IsString({ message: 'OAUTH2_SCOPE 必须为非空字符串' })
  OAUTH2_SCOPE?: string;

  // ---------- LDAP ----------
  @IsOptional()
  @Matches(/^ldaps?:\/\/.+/i, {
    message: 'LDAP_URL 必须以 ldap:// 或 ldaps:// 开头',
  })
  LDAP_URL?: string;

  @IsOptional()
  @IsString({ message: 'LDAP_BIND_DN 必须为非空字符串' })
  LDAP_BIND_DN?: string;

  @IsOptional()
  @IsString({ message: 'LDAP_BIND_CREDENTIALS 必须为非空字符串' })
  LDAP_BIND_CREDENTIALS?: string;

  @IsOptional()
  @IsString({ message: 'LDAP_SEARCH_BASE 必须为非空字符串' })
  LDAP_SEARCH_BASE?: string;

  @IsOptional()
  @Matches(/\{\{username\}\}/, {
    message: 'LDAP_SEARCH_FILTER 必须包含 {{username}} 占位符',
  })
  LDAP_SEARCH_FILTER?: string;
}

/**
 * ConfigModule 的 validate 钩子。
 * 接收合并后的环境变量，返回通过校验的对象；失败则抛出错误中止启动。
 */
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}))
      .flat()
      .map((m) => `  - ${m}`);
    throw new Error(
      `环境变量配置校验失败，应用启动中止:\n${messages.join('\n')}`,
    );
  }

  // 生产环境的额外强制校验
  if (config.NODE_ENV === 'production') {
    if (!config.JWT_SECRET) {
      throw new Error(
        '生产环境(NODE_ENV=production)必须显式配置 JWT_SECRET',
      );
    }
    if (INSECURE_JWT_SECRETS.has(`${config.JWT_SECRET}`)) {
      throw new Error(
        '生产环境 JWT_SECRET 不能使用已知的默认/不安全值，请使用强随机字符串',
      );
    }
    if (config.ALLOW_LOCAL_FALLBACK === 'true') {
      throw new Error(
        '生产环境禁止启用 ALLOW_LOCAL_FALLBACK=true，否则会削弱认证安全边界',
      );
    }
  }

  return validated as unknown as Record<string, unknown>;
}
