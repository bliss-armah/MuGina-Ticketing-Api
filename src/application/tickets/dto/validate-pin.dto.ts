import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidatePinDto {
  @ApiProperty({ description: '6-digit entry PIN', example: '123456' })
  @IsString()
  @Length(6, 6)
  pin: string;

  @ApiProperty({ description: 'Event ID being scanned at' })
  @IsString()
  eventId: string;
}
