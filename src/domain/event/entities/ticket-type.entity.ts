export class TicketTypeEntity {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  soldCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  get availableCount(): number {
    return this.quantity - this.soldCount;
  }

  hasAvailability(qty: number = 1): boolean {
    return this.availableCount >= qty;
  }
}
