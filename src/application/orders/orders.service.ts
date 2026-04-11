import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateOrderDto } from './dto/create-order.dto';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/order/repositories/order.repository.interface';
import { IEventRepository, EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';
import { PaystackService } from '../../infrastructure/paystack/paystack.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly paystack: PaystackService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const event = await this.eventRepo.findById(dto.eventId);
    if (!event) throw new NotFoundException('Event not found');
    if (!event.isPublished) throw new BadRequestException('Event is not available');

    let totalAmount = 0;
    const resolvedItems: Array<{ ticketTypeId: string; quantity: number; unitPrice: number }> = [];

    for (const item of dto.items) {
      const ticketType = await this.eventRepo.findTicketTypeById(item.ticketTypeId);
      if (!ticketType) throw new NotFoundException(`Ticket type ${item.ticketTypeId} not found`);
      if (ticketType.eventId !== dto.eventId) throw new BadRequestException('Ticket type does not belong to this event');
      if (!ticketType.hasAvailability(item.quantity)) {
        throw new BadRequestException(`Not enough tickets available for ${ticketType.name}`);
      }

      const itemTotal = ticketType.price * item.quantity;
      totalAmount += itemTotal;
      resolvedItems.push({ ticketTypeId: item.ticketTypeId, quantity: item.quantity, unitPrice: ticketType.price });
    }

    const paystackRef = `MUG-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

    const order = await this.orderRepo.create(
      { userId, eventId: dto.eventId, totalAmount, paystackRef },
      resolvedItems,
    );

    const paystackResponse = await this.paystack.initializeTransaction({
      email: user.email,
      amount: totalAmount,
      reference: paystackRef,
      callbackUrl: dto.callbackUrl,
      metadata: { orderId: order.id, userId, eventId: dto.eventId },
    });

    this.logger.log(`Order created: ${order.id}, ref: ${paystackRef}`);

    return { order, payment: paystackResponse };
  }

  async findByUser(userId: string) {
    return this.orderRepo.findByUserId(userId);
  }

  async findById(id: string, userId: string) {
    const order = await this.orderRepo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new BadRequestException('Access denied');
    return order;
  }
}
