import { EventEntity } from '../entities/event.entity';
import { TicketTypeEntity } from '../entities/ticket-type.entity';

export interface IEventRepository {
  findById(id: string): Promise<EventEntity | null>;
  findAll(filters?: { isPublished?: boolean; organizerId?: string }): Promise<EventEntity[]>;
  create(data: Partial<EventEntity>): Promise<EventEntity>;
  update(id: string, data: Partial<EventEntity>): Promise<EventEntity>;
  delete(id: string): Promise<void>;
  createTicketType(data: Partial<TicketTypeEntity>): Promise<TicketTypeEntity>;
  findTicketTypes(eventId: string): Promise<TicketTypeEntity[]>;
  findTicketTypeById(id: string): Promise<TicketTypeEntity | null>;
  incrementSoldCount(ticketTypeId: string, qty: number): Promise<void>;
}

export const EVENT_REPOSITORY = Symbol('IEventRepository');
