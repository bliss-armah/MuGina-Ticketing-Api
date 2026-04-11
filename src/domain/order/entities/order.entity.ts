export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export class OrderEntity {
  id: string;
  userId: string;
  eventId: string;
  totalAmount: number;
  status: OrderStatus;
  paystackRef?: string;
  paystackChannel?: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  isPaid(): boolean {
    return this.status === OrderStatus.PAID;
  }
}
