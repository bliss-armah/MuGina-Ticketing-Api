import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from '../../application/orders/orders.service';
import { OrderPrismaRepository } from '../../infrastructure/database/repositories/order.prisma.repository';
import { ORDER_REPOSITORY } from '../../domain/order/repositories/order.repository.interface';
import { EventPrismaRepository } from '../../infrastructure/database/repositories/event.prisma.repository';
import { EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { UserPrismaRepository } from '../../infrastructure/database/repositories/user.prisma.repository';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    { provide: ORDER_REPOSITORY, useClass: OrderPrismaRepository },
    { provide: EVENT_REPOSITORY, useClass: EventPrismaRepository },
    { provide: USER_REPOSITORY, useClass: UserPrismaRepository },
  ],
})
export class OrdersModule {}
