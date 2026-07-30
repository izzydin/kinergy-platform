import { ApiProperty } from '@nestjs/swagger';
import { PotentialMatchDto } from '../../application/dto/potential-match.dto';

export class PotentialMatchResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  clientId!: string;

  @ApiProperty({ example: 'CLI-2026-12345' })
  referenceNumber!: string;

  @ApiProperty({ example: 'John Doe' })
  fullName!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ example: '+14155552671' })
  phone!: string;

  @ApiProperty({ example: 'SIMILAR_NAME', enum: ['EXACT_PHONE', 'SIMILAR_NAME', 'SIMILAR_PHONE'] })
  matchReason!: 'EXACT_PHONE' | 'SIMILAR_NAME' | 'SIMILAR_PHONE';
}

export class PotentialMatchesResponseDto {
  @ApiProperty({ example: 'POTENTIAL_DUPLICATES_FOUND' })
  status!: 'POTENTIAL_DUPLICATES_FOUND';

  @ApiProperty({
    description: 'Warning message explaining potential duplicate profiles',
    example: 'Soft duplicate warning: Potential matching client profiles were found.',
  })
  message!: string;

  @ApiProperty({ type: [PotentialMatchResponseDto] })
  potentialMatches!: PotentialMatchResponseDto[];

  public static fromDomainMatches(matches: PotentialMatchDto[]): PotentialMatchesResponseDto {
    const dto = new PotentialMatchesResponseDto();
    dto.status = 'POTENTIAL_DUPLICATES_FOUND';
    dto.message =
      'Soft duplicate warning: Potential matching client profiles were found. Pass bypassSoftDuplicates=true to force creation.';
    dto.potentialMatches = matches.map((m) => ({
      clientId: m.clientId,
      referenceNumber: m.referenceNumber,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      matchReason: m.matchReason,
    }));
    return dto;
  }
}
