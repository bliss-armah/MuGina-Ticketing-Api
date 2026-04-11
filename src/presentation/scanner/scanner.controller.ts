import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from '../../application/tickets/tickets.service';
import { ValidateTicketDto } from '../../application/tickets/dto/validate-ticket.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Scanner')
@Controller('scanner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GATE_AGENT', 'ORGANIZER')
@ApiBearerAuth()
export class ScannerController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('validate')
  @Throttle({ default: { ttl: 1000, limit: 10 } }) // 10 scans/second max
  @ApiOperation({ summary: 'Validate a ticket QR code' })
  async validate(
    @Body() dto: ValidateTicketDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress;
    return this.ticketsService.validateTicket(dto, user.id, ip);
  }

  @Get('event/:eventId/tickets')
  @ApiOperation({ summary: 'Download event tickets for offline caching' })
  async getEventTickets(@Param('eventId') eventId: string) {
    return this.ticketsService.getEventTicketsForCache(eventId);
  }
}
