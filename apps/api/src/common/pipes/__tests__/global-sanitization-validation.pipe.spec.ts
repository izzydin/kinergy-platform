import { BadRequestException } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { GlobalSanitizationValidationPipe } from '../global-sanitization-validation.pipe';

class SampleTestDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsNumber()
  age?: number;
}

describe('GlobalSanitizationValidationPipe Integration & Unit Tests', () => {
  let pipe: GlobalSanitizationValidationPipe;

  beforeEach(() => {
    pipe = new GlobalSanitizationValidationPipe();
  });

  describe('1. DTO Validation & Whitelisting', () => {
    it('should validate valid DTO payloads successfully', async () => {
      const payload = {
        email: 'test@example.com',
        name: 'John Doe',
        age: 30,
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: SampleTestDto,
      });

      expect(result).toBeInstanceOf(SampleTestDto);
      expect((result as SampleTestDto).email).toBe('test@example.com');
    });

    it('should throw BadRequestException when required fields fail validation', async () => {
      const payload = {
        email: 'not-an-email',
        name: '',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SampleTestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-whitelisted extra properties', async () => {
      const payload = {
        email: 'test@example.com',
        name: 'John Doe',
        unallowedProperty: 'hacked',
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: SampleTestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Implicit Type Conversion', () => {
    it('should implicitly convert string numbers to numeric types', async () => {
      const payload = {
        email: 'test@example.com',
        name: 'John Doe',
        age: '25',
      };

      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: SampleTestDto,
      })) as SampleTestDto;

      expect(result.age).toBe(25);
      expect(typeof result.age).toBe('number');
    });
  });

  describe('3. Input Sanitization Integration', () => {
    it('should trim whitespace and strip control characters before validating DTO', async () => {
      const payload = {
        email: '   user.test@example.com   ',
        name: '   Alice\u0000Smith   ',
      };

      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: SampleTestDto,
      })) as SampleTestDto;

      expect(result.email).toBe('user.test@example.com');
      expect(result.name).toBe('AliceSmith');
    });

    it('should strip XSS script tags from string properties prior to controller execution', async () => {
      const payload = {
        email: 'valid@example.com',
        name: '<script>alert(1)</script>Bob Builder',
      };

      const result = (await pipe.transform(payload, {
        type: 'body',
        metatype: SampleTestDto,
      })) as SampleTestDto;

      expect(result.name).toBe('Bob Builder');
    });
  });
});
