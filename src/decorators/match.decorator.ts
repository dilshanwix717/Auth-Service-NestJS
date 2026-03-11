/**
 * @file match.decorator.ts
 * @description Custom class-validator decorator that asserts one property's value
 * matches another property on the same object (e.g. confirmPassword === password).
 *
 * Usage:
 *   @Match('password')
 *   confirmPassword: string;
 */

import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that the decorated property's value is strictly equal to
 * the value of the specified `relatedPropertyName` on the same object.
 *
 * @param relatedPropertyName - The name of the property to compare against.
 * @param validationOptions   - Optional class-validator options.
 */
export function Match(
  relatedPropertyName: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'Match',
      target: object.constructor,
      propertyName,
      constraints: [relatedPropertyName],
      options: {
        message: `${propertyName} must match ${relatedPropertyName}`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[
            related
          ];
          return value === relatedValue;
        },
      },
    });
  };
}
