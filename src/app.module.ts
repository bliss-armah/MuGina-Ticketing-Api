import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { RedisModule } from './infrastructure/cache/redis.module';
import { CloudinaryModule } from './infrastructure/cloudinary/cloudinary.module';
import { PaystackModule } from './infrastructure/paystack/paystack.module';
import { AuthModule } from './presentation/auth/auth.module';
import { EventsModule } from './presentation/events/events.module';
import { TicketsModule } from './presentation/tickets/tickets.module';
import { OrdersModule } from './presentation/orders/orders.module';
import { PaymentsModule } from './presentation/payments/payments.module';
import { ScannerModule } from './presentation/scanner/scanner.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    CloudinaryModule,
    PaystackModule,
    AuthModule,
    EventsModule,
    TicketsModule,
    OrdersModule,
    PaymentsModule,
    ScannerModule,
  ],
})
export class AppModule {}
