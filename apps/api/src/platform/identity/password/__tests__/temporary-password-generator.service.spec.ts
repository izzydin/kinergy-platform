import { PasswordPolicyService } from '../password-policy.service';
import { TemporaryPasswordGeneratorService } from '../temporary-password-generator.service';

describe('TemporaryPasswordGeneratorService', () => {
  let generator: TemporaryPasswordGeneratorService;
  let policyService: PasswordPolicyService;

  beforeEach(() => {
    policyService = new PasswordPolicyService();
    generator = new TemporaryPasswordGeneratorService(policyService);
  });

  it('should generate a cryptographically secure temporary password matching complexity rules', () => {
    const tempPassword = generator.generate(16);

    expect(tempPassword).toBeDefined();
    expect(tempPassword.length).toBe(16);

    const validation = policyService.validate(tempPassword);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should generate unique temporary passwords on consecutive calls', () => {
    const pass1 = generator.generate(16);
    const pass2 = generator.generate(16);

    expect(pass1).not.toEqual(pass2);
  });
});
