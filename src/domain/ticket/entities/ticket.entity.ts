export enum TicketStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export class TicketEntity {
  id: string;
  orderId: string;
  ticketTypeId: string;
  eventId: string;
  holderId?: string | null;
  entryPin?: string | null;
  status: TicketStatus;
  qrPayload: string;
  qrImageUrl?: string;
  isUsed: boolean;
  scannedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  isValid(): boolean {
    return this.status === TicketStatus.ACTIVE && !this.isUsed;
  }
}

export type CreateTicketInput = {
  id: string;
  orderId: string;
  ticketTypeId: string;
  eventId: string;
  holderId?: string | null;
  entryPin?: string;
  qrPayload: string;
  isUsed: boolean;
  status: TicketStatus;
};
