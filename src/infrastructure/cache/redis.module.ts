import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { TicketCacheService } from './ticket-cache.service';

@Global()
@Module({
  providers: [RedisService, TicketCacheService],
  exports: [RedisService, TicketCacheService],
})
export class RedisModule {}
