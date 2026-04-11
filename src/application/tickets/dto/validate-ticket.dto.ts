import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTicketDto {
  @ApiProperty({ description: 'QR payload (signed token from QR code)' })
  @IsString()
  qrPayload: string;

  @ApiProperty({ description: 'Event ID being scanned at' })
  @IsString()
  eventId: string;
}
