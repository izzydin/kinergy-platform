export const PASSWORD_POLICY_CONFIGURATION = Symbol('PASSWORD_POLICY_CONFIGURATION');

export interface IPasswordPolicyConfiguration {
  getArgon2MemoryCost(): number;
  getArgon2TimeCost(): number;
  getArgon2Parallelism(): number;
  getArgon2HashLength(): number;
  getMinLength(): number;
  getMaxLength(): number;
  getRequireUppercase(): boolean;
  getRequireLowercase(): boolean;
  getRequireNumber(): boolean;
  getRequireSpecialChar(): boolean;
  getPasswordHistoryLimit(): number;
}
