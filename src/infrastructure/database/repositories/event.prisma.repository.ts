import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IEventRepository } from '../../../domain/event/repositories/event.repository.interface';
import { EventEntity } from '../../../domain/event/entities/event.entity';
import { TicketTypeEntity } from '../../../domain/event/entities/ticket-type.entity';

@Injectable()
export class EventPrismaRepository implements IEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEventEntity(raw: any): EventEntity {
    const entity = new EventEntity();
    Object.assign(entity, raw);
    return entity;
  }

  private toTicketTypeEntity(raw: any): TicketTypeEntity {
    const entity = new TicketTypeEntity();
    Object.assign(entity, { ...raw, price: Number(raw.price) });
    return entity;
  }

  async findById(id: string): Promise<EventEntity | null> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { ticketTypes: true },
    });
    return event ? this.toEventEntity(event) : null;
  }

  async findAll(filters?: { isPublished?: boolean; organizerId?: string }): Promise<EventEntity[]> {
    const events = await this.prisma.event.findMany({
      where: {
        ...(filters?.isPublished !== undefined && { isPublished: filters.isPublished }),
        ...(filters?.organizerId && { organizerId: filters.organizerId }),
      },
      include: { ticketTypes: true },
      orderBy: { startDate: 'asc' },
    });
    return events.map(this.toEventEntity);
  }

  async create(data: Partial<EventEntity>): Promise<EventEntity> {
    const event = await this.prisma.event.create({
      data: {
        organizerId: data.organizerId!,
        title: data.title!,
        description: data.description!,
        startDate: data.startDate!,
        endDate: data.endDate,
        location: data.location!,
        bannerUrl: data.bannerUrl,
        isPublished: data.isPublished ?? false,
      },
    });
    return this.toEventEntity(event);
  }

  async update(id: string, data: Partial<EventEntity>): Promise<EventEntity> {
    const event = await this.prisma.event.update({
      where: { id },
      data: data as any,
    });
    return this.toEventEntity(event);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.event.delete({ where: { id } });
  }

  async createTicketType(data: Partial<TicketTypeEntity>): Promise<TicketTypeEntity> {
    const tt = await this.prisma.ticketType.create({
      data: {
        eventId: data.eventId!,
        name: data.name!,
        description: data.description,
        price: data.price!,
        quantity: data.quantity!,
      },
    });
    return this.toTicketTypeEntity(tt);
  }

  async findTicketTypes(eventId: string): Promise<TicketTypeEntity[]> {
    const types = await this.prisma.ticketType.findMany({ where: { eventId, isActive: true } });
    return types.map(this.toTicketTypeEntity.bind(this));
  }

  async findTicketTypeById(id: string): Promise<TicketTypeEntity | null> {
    const tt = await this.prisma.ticketType.findUnique({ where: { id } });
    return tt ? this.toTicketTypeEntity(tt) : null;
  }

  async incrementSoldCount(ticketTypeId: string, qty: number): Promise<void> {
    await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: { soldCount: { increment: qty } },
    });
  }
}
