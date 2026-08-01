import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { AuthStrategyType } from '../interfaces/auth-strategy.interface';

/** 条件校验的边界选项 */
export interface RequiredForStrategyOptions {
  /** 最小长度（默认 1） */
  minLength?: number;
  /** 最大长度（必填，防止超长输入 / DoS） */
  maxLength: number;
}

/**
 * 依据认证策略进行“条件必填 + 边界”校验（问题 8 + 问题 2）。
 *
 * 规则：
 * - JWT / LDAP 策略：username 与 password 必填。
 * - OAuth2 策略：code 必填。
 * - strategy 未提供时，按默认策略语义（jwt）处理。
 *
 * 边界（无论是否必填，只要提供了值就校验）：
 * - 必须为字符串；
 * - 长度需落在 [minLength, maxLength] 区间；
 * - 适用策略下缺失或空白视为不通过（必填）。
 *
 * 说明：这里将“必填”与“边界”合并到同一个校验器，避免与 class-validator 的
 * @ValidateIf 冲突（@ValidateIf 为 false 会跳过该属性的全部校验，从而使必填失效）。
 */
export function RequiredForStrategy(
  strategies: AuthStrategyType[],
  fieldLabel: string,
  options: RequiredForStrategyOptions,
  validationOptions?: ValidationOptions,
) {
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength;

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'requiredForStrategy',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [strategies, fieldLabel, minLength, maxLength],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [appliesTo, , min, max] = args.constraints as [
            AuthStrategyType[],
            string,
            number,
            number,
          ];
          const dto = args.object as { strategy?: string };
          // 未显式指定策略时，视为默认策略 jwt
          const currentStrategy = (dto.strategy ||
            AuthStrategyType.JWT) as AuthStrategyType;

          const applies = appliesTo.includes(currentStrategy);
          const provided = value !== undefined && value !== null;

          // 不适用于当前策略：未提供则通过；若提供了也要做边界校验，防止塞入超长脏数据
          if (!applies && !provided) {
            return true;
          }

          // 到这里：要么该策略必填，要么虽非必填但用户提供了值 —— 统一做类型与边界校验
          if (typeof value !== 'string') {
            return false;
          }
          const trimmedLen = value.trim().length;
          // 必填场景下不允许空白
          if (applies && trimmedLen < Math.max(1, min)) {
            return false;
          }
          if (value.length < min || value.length > max) {
            return false;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const [appliesTo, label, min, max] = args.constraints as [
            AuthStrategyType[],
            string,
            number,
            number,
          ];
          const dto = args.object as { strategy?: string };
          const currentStrategy = dto.strategy || AuthStrategyType.JWT;
          if (appliesTo.includes(currentStrategy as AuthStrategyType)) {
            return `${label} 在 ${appliesTo.join(' / ')} 策略下为必填项，且长度需在 ${min}-${max} 之间`;
          }
          return `${label} 长度需在 ${min}-${max} 之间`;
        },
      },
    });
  };
}
