import { Injectable, Logger, Inject } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/order/repositories/order.repository.interface';
import { PaystackService } from '../../infrastructure/paystack/paystack.service';
import { TicketsService } from '../tickets/tickets.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    private readonly paystack: PaystackService,
    private readonly ticketsService: TicketsService,
    private readonly prisma: PrismaService,
  ) {}

  verifySignature(rawBody: string, signature: string): boolean {
    return this.paystack.verifyWebhookSignature(rawBody, signature);
  }

  async processWebhookAsync(rawBody: string): Promise<void> {
    const event = JSON.parse(rawBody);
    this.logger.log(`Processing Paystack event: ${event.event}`);

    if (event.event === 'charge.success') {
      await this.handleChargeSuccess(event.data);
    }
  }

  private async handleChargeSuccess(data: any): Promise<void> {
    const reference = data.reference;
    const order = await this.orderRepo.findByPaystackRef(reference);

    if (!order) {
      this.logger.warn(`Order not found for reference: ${reference}`);
      return;
    }

    if (order.isPaid()) {
      this.logger.log(`Order ${order.id} already processed — skipping`);
      return;
    }

    const verified = await this.paystack.verifyTransaction(reference);
    if (verified.status !== 'success') {
      this.logger.warn(`Payment not confirmed for order ${order.id}`);
      return;
    }

    await this.orderRepo.updateStatus(order.id, 'PAID', {
      paidAt: new Date(verified.paidAt),
      paystackChannel: verified.channel,
    });

    const fullOrder = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: { orderItems: true },
    });

    if (!fullOrder) return;

    await this.ticketsService.generateTicketsForOrder(
      order.id,
      order.eventId,
      fullOrder.orderItems.map((item) => ({
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
      })),
      {
        holderId: fullOrder.userId ?? null,
        guestPhone: fullOrder.guestPhone ?? null,
        guestName: fullOrder.guestName ?? null,
      },
    );

    this.logger.log(`Payment processed and tickets generated for order ${order.id}`);
  }

  async verifyPayment(reference: string) {
    return this.paystack.verifyTransaction(reference);
  }
}
