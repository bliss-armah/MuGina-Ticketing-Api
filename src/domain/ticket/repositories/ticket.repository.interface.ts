import { TicketEntity } from '../entities/ticket.entity';

export interface ITicketRepository {
  findById(id: string): Promise<TicketEntity | null>;
  findByOrderId(orderId: string): Promise<TicketEntity[]>;
  findByEventId(eventId: string): Promise<TicketEntity[]>;
  findByHolderId(holderId: string): Promise<TicketEntity[]>;
  findByEntryPin(pin: string, eventId: string): Promise<TicketEntity | null>;
  create(data: Partial<TicketEntity>): Promise<TicketEntity>;
  createMany(data: Partial<TicketEntity>[]): Promise<void>;
  markAsUsed(ticketId: string, scannedAt: Date): Promise<TicketEntity>;
  updateQrImageUrl(ticketId: string, url: string): Promise<void>;
}

export const TICKET_REPOSITORY = Symbol('ITicketRepository');
