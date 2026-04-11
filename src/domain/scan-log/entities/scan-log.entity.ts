export class ScanLogEntity {
  id: string;
  ticketId: string;
  scannedBy: string;
  eventId: string;
  result: 'valid' | 'already_used' | 'invalid';
  ipAddress?: string;
  deviceInfo?: string;
  createdAt: Date;
}
