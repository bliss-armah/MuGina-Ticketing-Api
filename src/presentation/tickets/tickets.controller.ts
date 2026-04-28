import { Controller, Get, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from '../../application/tickets/tickets.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Tickets')
@Controller('tickets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('my-tickets')
  @ApiOperation({ summary: 'Get my tickets' })
  getMyTickets(@CurrentUser() user: JwtUser) {
    return this.ticketsService.getMyTickets(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket by ID' })
  getTicket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.ticketsService.getTicketById(id, user.id);
  }
}
