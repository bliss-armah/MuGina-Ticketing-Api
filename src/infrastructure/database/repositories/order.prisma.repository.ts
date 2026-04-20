import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IOrderRepository } from '../../../domain/order/repositories/order.repository.interface';
import { OrderEntity, OrderStatus } from '../../../domain/order/entities/order.entity';

@Injectable()
export class OrderPrismaRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(raw: any): OrderEntity {
    const entity = new OrderEntity();
    Object.assign(entity, {
      ...raw,
      totalAmount: Number(raw.totalAmount),
      status: raw.status as OrderStatus,
    });
    return entity;
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { orderItems: { include: { ticketType: true } }, event: true, tickets: true },
    });
    return order ? this.toEntity(order) : null;
  }

  async findByUserId(userId: string): Promise<OrderEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: { event: true, orderItems: { include: { ticketType: true } }, tickets: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.toEntity.bind(this));
  }

  async findByGuestPhone(phone: string): Promise<OrderEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { guestPhone: phone },
      include: { event: true, orderItems: { include: { ticketType: true } }, tickets: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.toEntity.bind(this));
  }

  async findByPaystackRef(ref: string): Promise<OrderEntity | null> {
    const order = await this.prisma.order.findUnique({
      where: { paystackRef: ref },
      include: { orderItems: true },
    });
    return order ? this.toEntity(order) : null;
  }

  async create(
    data: Partial<OrderEntity>,
    items: Array<{ ticketTypeId: string; quantity: number; unitPrice: number }>,
  ): Promise<OrderEntity> {
    const order = await this.prisma.order.create({
      data: {
        userId: data.userId ?? null,
        eventId: data.eventId!,
        totalAmount: data.totalAmount!,
        status: 'PENDING',
        paystackRef: data.paystackRef,
        guestName: data.guestName ?? null,
        guestEmail: data.guestEmail ?? null,
        guestPhone: data.guestPhone ?? null,
        orderItems: {
          create: items.map((item) => ({
            ticketTypeId: item.ticketTypeId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: { orderItems: true },
    });
    return this.toEntity(order);
  }

  async updateStatus(id: string, status: string, extra?: Partial<OrderEntity>): Promise<OrderEntity> {
    const order = await this.prisma.order.update({
      where: { id },
      data: { status: status as any, ...extra },
    });
    return this.toEntity(order);
  }
}
