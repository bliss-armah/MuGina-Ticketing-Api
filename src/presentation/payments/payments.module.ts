import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from '../../application/payments/payments.service';
import { TicketsModule } from '../tickets/tickets.module';
import { OrderPrismaRepository } from '../../infrastructure/database/repositories/order.prisma.repository';
import { ORDER_REPOSITORY } from '../../domain/order/repositories/order.repository.interface';

@Module({
  imports: [TicketsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: ORDER_REPOSITORY, useClass: OrderPrismaRepository },
  ],
})
export class PaymentsModule {}
