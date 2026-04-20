import { IsString, IsArray, ValidateNested, IsNumber, Min, IsEmail, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OrderItemDto } from './create-order.dto';

export class CreateGuestOrderDto {
  @ApiProperty({ example: 'Kwame Mensah' })
  @IsString()
  @MinLength(2)
  guestName: string;

  @ApiProperty({ example: 'kwame@example.com' })
  @IsEmail()
  guestEmail: string;

  @ApiProperty({ example: '0201234567' })
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  guestPhone: string;

  @ApiProperty()
  @IsString()
  eventId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 'https://yoursite.com/payment/callback' })
  @IsString()
  callbackUrl: string;
}
