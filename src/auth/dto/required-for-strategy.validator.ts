import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { AuthStrategyType } from '../interfaces/auth-strategy.interface';

/**
 * 依据认证策略进行条件必填校验（问题 8）。
 *
 * 规则：
 * - JWT / LDAP 策略：username 与 password 必填。
 * - OAuth2 策略：code 必填。
 * - strategy 未提供时，按默认策略语义要求 username/password（与服务端默认 jwt 对齐）。
 *
 * 用法：在需要条件必填的字段上标注 @RequiredForStrategy([...策略], '字段名')。
 */
export function RequiredForStrategy(
  strategies: AuthStrategyType[],
  fieldLabel: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'requiredForStrategy',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [strategies, fieldLabel],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [appliesTo] = args.constraints as [AuthStrategyType[], string];
          const dto = args.object as { strategy?: string };
          // 未显式指定策略时，视为默认策略 jwt
          const currentStrategy = (dto.strategy ||
            AuthStrategyType.JWT) as AuthStrategyType;

          // 若当前策略不在该字段的适用范围内，则不强制校验（视为通过）
          if (!appliesTo.includes(currentStrategy)) {
            return true;
          }
          // 适用范围内：要求非空字符串
          return typeof value === 'string' && value.trim().length > 0;
        },
        defaultMessage(args: ValidationArguments) {
          const [appliesTo, label] = args.constraints as [
            AuthStrategyType[],
            string,
          ];
          return `${label} 在 ${appliesTo.join(' / ')} 策略下为必填项`;
        },
      },
    });
  };
}
