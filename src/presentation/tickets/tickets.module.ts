import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from '../../application/tickets/tickets.service';
import { TicketPrismaRepository } from '../../infrastructure/database/repositories/ticket.prisma.repository';
import { TICKET_REPOSITORY } from '../../domain/ticket/repositories/ticket.repository.interface';
import { EventPrismaRepository } from '../../infrastructure/database/repositories/event.prisma.repository';
import { EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';

@Module({
  controllers: [TicketsController],
  providers: [
    TicketsService,
    { provide: TICKET_REPOSITORY, useClass: TicketPrismaRepository },
    { provide: EVENT_REPOSITORY, useClass: EventPrismaRepository },
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
