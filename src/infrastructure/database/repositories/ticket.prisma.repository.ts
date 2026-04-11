import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ITicketRepository } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { TicketEntity, TicketStatus } from '../../../domain/ticket/entities/ticket.entity';

@Injectable()
export class TicketPrismaRepository implements ITicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(raw: any): TicketEntity {
    const entity = new TicketEntity();
    Object.assign(entity, { ...raw, status: raw.status as TicketStatus });
    return entity;
  }

  async findById(id: string): Promise<TicketEntity | null> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    return ticket ? this.toEntity(ticket) : null;
  }

  async findByOrderId(orderId: string): Promise<TicketEntity[]> {
    const tickets = await this.prisma.ticket.findMany({ where: { orderId } });
    return tickets.map(this.toEntity.bind(this));
  }

  async findByEventId(eventId: string): Promise<TicketEntity[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      select: { id: true, isUsed: true, status: true, eventId: true, ticketTypeId: true, holderId: true, qrPayload: true, qrImageUrl: true, orderId: true, scannedAt: true, createdAt: true, updatedAt: true },
    });
    return tickets.map(this.toEntity.bind(this));
  }

  async findByHolderId(holderId: string): Promise<TicketEntity[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { holderId },
      include: { order: { include: { event: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map(this.toEntity.bind(this));
  }

  async create(data: Partial<TicketEntity>): Promise<TicketEntity> {
    const ticket = await this.prisma.ticket.create({ data: data as any });
    return this.toEntity(ticket);
  }

  async createMany(data: Partial<TicketEntity>[]): Promise<void> {
    await this.prisma.ticket.createMany({ data: data as any[] });
  }

  async markAsUsed(ticketId: string, scannedAt: Date): Promise<TicketEntity> {
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { isUsed: true, scannedAt, status: 'USED' },
    });
    return this.toEntity(ticket);
  }

  async updateQrImageUrl(ticketId: string, url: string): Promise<void> {
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { qrImageUrl: url } });
  }
}
