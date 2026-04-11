import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { ITicketRepository, TICKET_REPOSITORY } from '../../domain/ticket/repositories/ticket.repository.interface';
import { IEventRepository, EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { TicketCacheService } from '../../infrastructure/cache/ticket-cache.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ValidateTicketDto } from './dto/validate-ticket.dto';

export interface QRPayload {
  ticketId: string;
  eventId: string;
  issuedAt: number;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly hmacSecret: string;

  constructor(
    @Inject(TICKET_REPOSITORY)
    private readonly ticketRepo: ITicketRepository,
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    private readonly ticketCache: TicketCacheService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.hmacSecret = this.config.get<string>('QR_HMAC_SECRET', 'default-secret-change-me');
  }

  signQrPayload(payload: QRPayload): string {
    const data = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', this.hmacSecret).update(data).digest('hex');
    const encoded = Buffer.from(data).toString('base64url');
    return `${encoded}.${signature}`;
  }

  verifyQrPayload(token: string): QRPayload | null {
    try {
      const [encoded, signature] = token.split('.');
      if (!encoded || !signature) return null;

      const data = Buffer.from(encoded, 'base64url').toString('utf-8');
      const expectedSig = crypto.createHmac('sha256', this.hmacSecret).update(data).digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return null;
      }

      return JSON.parse(data) as QRPayload;
    } catch {
      return null;
    }
  }

  async generateTicketsForOrder(
    orderId: string,
    userId: string,
    eventId: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
  ): Promise<void> {
    const ticketsToCreate = [];

    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const { v4: uuidv4 } = await import('uuid');
        const ticketId = uuidv4();
        const payload: QRPayload = { ticketId, eventId, issuedAt: Date.now() };
        const qrPayload = this.signQrPayload(payload);

        ticketsToCreate.push({
          id: ticketId,
          orderId,
          ticketTypeId: item.ticketTypeId,
          eventId,
          holderId: userId,
          qrPayload,
          isUsed: false,
          status: 'ACTIVE',
        });
      }
    }

    await this.ticketRepo.createMany(ticketsToCreate);

    // Generate QR code images and cache status asynchronously
    for (const t of ticketsToCreate) {
      this.generateQrImage(t.id, t.qrPayload).catch((e) =>
        this.logger.error(`QR image gen failed for ${t.id}`, e),
      );
      await this.ticketCache.cacheTicketStatus(t.id, false);
    }

    // Increment sold counts
    const countByType: Record<string, number> = {};
    for (const item of items) {
      countByType[item.ticketTypeId] = (countByType[item.ticketTypeId] || 0) + item.quantity;
    }
    for (const [ttId, qty] of Object.entries(countByType)) {
      await this.eventRepo.incrementSoldCount(ttId, qty);
    }

    this.logger.log(`Generated ${ticketsToCreate.length} tickets for order ${orderId}`);
  }

  private async generateQrImage(ticketId: string, qrPayload: string): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'H', width: 400 });
      await this.ticketRepo.updateQrImageUrl(ticketId, dataUrl);
    } catch (err) {
      this.logger.error(`Failed to generate QR for ticket ${ticketId}`, err);
    }
  }

  async validateTicket(dto: ValidateTicketDto, agentId: string, ip?: string): Promise<{
    status: 'valid' | 'already_used' | 'invalid';
    message: string;
    ticketId?: string;
  }> {
    // Verify QR signature
    const payload = this.verifyQrPayload(dto.qrPayload);
    if (!payload) {
      await this.logScan('unknown', agentId, dto.eventId, 'invalid', ip);
      return { status: 'invalid', message: 'Invalid QR code' };
    }

    // Validate event matches
    if (payload.eventId !== dto.eventId) {
      await this.logScan(payload.ticketId, agentId, dto.eventId, 'invalid', ip);
      return { status: 'invalid', message: 'Ticket is for a different event' };
    }

    // Check Redis cache first (fast path)
    const cached = await this.ticketCache.getTicketStatus(payload.ticketId);
    if (cached?.isUsed) {
      await this.logScan(payload.ticketId, agentId, dto.eventId, 'already_used', ip);
      return { status: 'already_used', message: 'Ticket has already been used', ticketId: payload.ticketId };
    }

    // DB check
    const ticket = await this.ticketRepo.findById(payload.ticketId);
    if (!ticket) {
      return { status: 'invalid', message: 'Ticket not found' };
    }

    if (ticket.isUsed || ticket.status === 'USED') {
      await this.ticketCache.markTicketUsedInCache(payload.ticketId);
      await this.logScan(payload.ticketId, agentId, dto.eventId, 'already_used', ip);
      return { status: 'already_used', message: 'Ticket has already been used', ticketId: payload.ticketId };
    }

    if (ticket.eventId !== dto.eventId) {
      return { status: 'invalid', message: 'Ticket is for a different event' };
    }

    // Mark as used
    await this.ticketRepo.markAsUsed(payload.ticketId, new Date());
    await this.ticketCache.markTicketUsedInCache(payload.ticketId);
    await this.logScan(payload.ticketId, agentId, dto.eventId, 'valid', ip);

    this.logger.log(`Ticket ${payload.ticketId} validated successfully by agent ${agentId}`);
    return { status: 'valid', message: 'Ticket is valid', ticketId: payload.ticketId };
  }

  private async logScan(ticketId: string, agentId: string, eventId: string, result: string, ip?: string): Promise<void> {
    try {
      if (ticketId === 'unknown') return;
      await this.prisma.scanLog.create({
        data: { ticketId, scannedBy: agentId, eventId, result, ipAddress: ip },
      });
    } catch (e) {
      this.logger.error('Failed to log scan', e);
    }
  }

  async getMyTickets(userId: string) {
    const tickets = await this.ticketRepo.findByHolderId(userId);
    return tickets;
  }

  async getTicketById(ticketId: string, userId: string) {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.holderId !== userId) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async getEventTicketsForCache(eventId: string) {
    const tickets = await this.ticketRepo.findByEventId(eventId);
    const summary = tickets.map((t) => ({ id: t.id, isUsed: t.isUsed, status: t.status }));
    await this.ticketCache.cacheEventTickets(eventId, summary);
    return summary;
  }
}
