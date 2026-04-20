import { OrderEntity } from '../entities/order.entity';

export interface IOrderRepository {
  findById(id: string): Promise<OrderEntity | null>;
  findByUserId(userId: string): Promise<OrderEntity[]>;
  findByGuestPhone(phone: string): Promise<OrderEntity[]>;
  findByPaystackRef(ref: string): Promise<OrderEntity | null>;
  create(data: Partial<OrderEntity>, items: Array<{ ticketTypeId: string; quantity: number; unitPrice: number }>): Promise<OrderEntity>;
  updateStatus(id: string, status: string, extra?: Partial<OrderEntity>): Promise<OrderEntity>;
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository');
