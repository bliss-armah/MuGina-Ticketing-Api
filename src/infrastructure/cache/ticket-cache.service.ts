import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

const TICKET_CACHE_TTL = 86400; // 24 hours
const TICKET_KEY_PREFIX = 'ticket:';
const EVENT_TICKETS_KEY_PREFIX = 'event_tickets:';

@Injectable()
export class TicketCacheService {
  private readonly logger = new Logger(TicketCacheService.name);

  constructor(private readonly redis: RedisService) {}

  private ticketKey(ticketId: string): string {
    return `${TICKET_KEY_PREFIX}${ticketId}`;
  }

  async cacheTicketStatus(ticketId: string, isUsed: boolean): Promise<void> {
    await this.redis.set(
      this.ticketKey(ticketId),
      JSON.stringify({ isUsed, cachedAt: new Date().toISOString() }),
      TICKET_CACHE_TTL,
    );
  }

  async getTicketStatus(ticketId: string): Promise<{ isUsed: boolean } | null> {
    const raw = await this.redis.get(this.ticketKey(ticketId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async markTicketUsedInCache(ticketId: string): Promise<void> {
    await this.cacheTicketStatus(ticketId, true);
  }

  async cacheEventTickets(eventId: string, tickets: Array<{ id: string; isUsed: boolean }>): Promise<void> {
    const key = `${EVENT_TICKETS_KEY_PREFIX}${eventId}`;
    await this.redis.set(key, JSON.stringify(tickets), TICKET_CACHE_TTL);
    this.logger.log(`Cached ${tickets.length} tickets for event ${eventId}`);
  }

  async getEventTickets(eventId: string): Promise<Array<{ id: string; isUsed: boolean }> | null> {
    const key = `${EVENT_TICKETS_KEY_PREFIX}${eventId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
