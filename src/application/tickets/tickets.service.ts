import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { ITicketRepository, TICKET_REPOSITORY } from '../../domain/ticket/repositories/ticket.repository.interface';
import { IEventRepository, EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { TicketCacheService } from '../../infrastructure/cache/ticket-cache.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import { ValidatePinDto } from './dto/validate-pin.dto';
import { CreateTicketInput, TicketStatus } from '@domain/ticket/entities/ticket.entity';

export interface QRPayload {
  ticketId: string;
  eventId: string;
  issuedAt: number;
}

type ValidationResult = {
  status: 'valid' | 'already_used' | 'invalid';
  message: string;
  ticketId?: string;
};

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
    private readonly smsService: SmsService,
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

  private generatePin(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async generateTicketsForOrder(
    orderId: string,
    eventId: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    options: {
      holderId?: string | null;
      guestPhone?: string | null;
      guestName?: string | null;
    } = {},
  ): Promise<void> {
    const ticketsToCreate: CreateTicketInput[] = [];
    const pinsGenerated: string[] = [];

    const event = await this.eventRepo.findById(eventId);
    const eventTitle = event?.title ?? 'your event';

    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const ticketId = uuidv4();
        const payload: QRPayload = { ticketId, eventId, issuedAt: Date.now() };
        const qrPayload = this.signQrPayload(payload);
        const pin = await this.generateUniquePin(eventId, ticketsToCreate.map((t) => t.entryPin!));

        ticketsToCreate.push({
          id: ticketId,
          orderId,
          ticketTypeId: item.ticketTypeId,
          eventId,
          holderId: options.holderId ?? null,
          entryPin: pin,
          qrPayload,
          isUsed: false,
          status: TicketStatus.ACTIVE,
        });

        pinsGenerated.push(pin);
      }
    }

    await this.ticketRepo.createMany(ticketsToCreate);

    for (const t of ticketsToCreate) {
      this.generateQrImage(t.id, t.qrPayload).catch((e) =>
        this.logger.error(`QR image gen failed for ${t.id}`, e),
      );
      await this.ticketCache.cacheTicketStatus(t.id, false);
      if (t.entryPin) {
        await this.ticketCache.cachePinToTicket(eventId, t.entryPin, t.id);
      }
    }

    // Increment sold counts
    const countByType: Record<string, number> = {};
    for (const item of items) {
      countByType[item.ticketTypeId] = (countByType[item.ticketTypeId] || 0) + item.quantity;
    }
    for (const [ttId, qty] of Object.entries(countByType)) {
      await this.eventRepo.incrementSoldCount(ttId, qty);
    }

    // Send SMS if guest phone is provided
    if (options.guestPhone && pinsGenerated.length > 0) {
      this.sendTicketPinSms(options.guestPhone, pinsGenerated, eventTitle, options.guestName).catch((e) =>
        this.logger.error('SMS send failed', e),
      );
    }

    this.logger.log(`Generated ${ticketsToCreate.length} tickets for order ${orderId}`);
  }

  private async generateUniquePin(eventId: string, usedInBatch: string[]): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const pin = this.generatePin();
      if (usedInBatch.includes(pin)) continue;
      const existing = await this.ticketCache.getTicketIdByPin(eventId, pin);
      if (!existing) return pin;
    }
    // Extremely unlikely — fall back to longer entropy
    return String(crypto.randomInt(100_000, 999_999));
  }

  private async sendTicketPinSms(phone: string, pins: string[], eventTitle: string, guestName?: string | null): Promise<void> {
    const greeting = guestName ? `Hi ${guestName.split(' ')[0]}, ` : '';
    let message: string;

    if (pins.length === 1) {
      message = `${greeting}your ticket for ${eventTitle} is confirmed! Entry PIN: ${pins[0]}. Show this PIN or QR code at the gate.`;
    } else {
      const pinList = pins.map((p, i) => `Ticket ${i + 1}: ${p}`).join(', ');
      message = `${greeting}your ${pins.length} tickets for ${eventTitle} are confirmed! Entry PINs: ${pinList}. Show a PIN or QR code at the gate.`;
    }

    await this.smsService.sendSms(phone, message);
  }

  private async generateQrImage(ticketId: string, qrPayload: string): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'H', width: 400 });
      await this.ticketRepo.updateQrImageUrl(ticketId, dataUrl);
    } catch (err) {
      this.logger.error(`Failed to generate QR for ticket ${ticketId}`, err);
    }
  }

  async validateTicket(dto: ValidateTicketDto, agentId: string, ip?: string): Promise<ValidationResult> {
    const payload = this.verifyQrPayload(dto.qrPayload);
    if (!payload) {
      await this.logScan('unknown', agentId, dto.eventId, 'invalid', ip);
      return { status: 'invalid', message: 'Invalid QR code' };
    }

    if (payload.eventId !== dto.eventId) {
      await this.logScan(payload.ticketId, agentId, dto.eventId, 'invalid', ip);
      return { status: 'invalid', message: 'Ticket is for a different event' };
    }

    return this.validateAndMarkTicket(payload.ticketId, dto.eventId, agentId, ip);
  }

  async validateTicketByPin(dto: ValidatePinDto, agentId: string, ip?: string): Promise<ValidationResult> {
    // Fast path: Redis
    const cachedTicketId = await this.ticketCache.getTicketIdByPin(dto.eventId, dto.pin);

    const ticketId = cachedTicketId ?? await this.resolveTicketIdByPin(dto.pin, dto.eventId);
    if (!ticketId) {
      await this.logScan('unknown', agentId, dto.eventId, 'invalid', ip);
      return { status: 'invalid', message: 'Invalid PIN' };
    }

    return this.validateAndMarkTicket(ticketId, dto.eventId, agentId, ip);
  }

  private async resolveTicketIdByPin(pin: string, eventId: string): Promise<string | null> {
    const ticket = await this.ticketRepo.findByEntryPin(pin, eventId);
    if (ticket) {
      await this.ticketCache.cachePinToTicket(eventId, pin, ticket.id);
      return ticket.id;
    }
    return null;
  }

  private async validateAndMarkTicket(ticketId: string, eventId: string, agentId: string, ip?: string): Promise<ValidationResult> {
    const cached = await this.ticketCache.getTicketStatus(ticketId);
    if (cached?.isUsed) {
      await this.logScan(ticketId, agentId, eventId, 'already_used', ip);
      return { status: 'already_used', message: 'Ticket has already been used', ticketId };
    }

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      return { status: 'invalid', message: 'Ticket not found' };
    }

    if (ticket.isUsed || ticket.status === 'USED') {
      await this.ticketCache.markTicketUsedInCache(ticketId);
      await this.logScan(ticketId, agentId, eventId, 'already_used', ip);
      return { status: 'already_used', message: 'Ticket has already been used', ticketId };
    }

    if (ticket.eventId !== eventId) {
      return { status: 'invalid', message: 'Ticket is for a different event' };
    }

    await this.ticketRepo.markAsUsed(ticketId, new Date());
    await this.ticketCache.markTicketUsedInCache(ticketId);
    await this.logScan(ticketId, agentId, eventId, 'valid', ip);

    this.logger.log(`Ticket ${ticketId} validated by agent ${agentId}`);
    return { status: 'valid', message: 'Ticket is valid', ticketId };
  }

  async lookupTicketsByPhone(phone: string, eventId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        eventId,
        order: { guestPhone: phone },
      },
      select: {
        id: true,
        status: true,
        isUsed: true,
        entryPin: true,
        ticketTypeId: true,
        scannedAt: true,
        order: { select: { guestName: true, guestPhone: true } },
      },
    });
    return tickets;
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
    return this.ticketRepo.findByHolderId(userId);
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
