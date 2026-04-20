import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const HUBTEL_API_URL = 'https://smsc.hubtel.com/v1/messages/send';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly senderId: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('HUBTEL_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('HUBTEL_CLIENT_SECRET', '');
    this.senderId = this.config.get<string>('HUBTEL_SENDER_ID', 'MUGINA');
  }

  async sendSms(to: string, message: string): Promise<void> {
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(`SMS not configured — would have sent to ${to}: ${message}`);
      return;
    }

    const phone = this.normalizePhone(to);
    try {
      await axios.post(
        HUBTEL_API_URL,
        { From: this.senderId, To: phone, Content: message, RegisteredDelivery: true },
        { auth: { username: this.clientId, password: this.clientSecret } },
      );
      this.logger.log(`SMS sent to ${phone}`);
    } catch (err: any) {
      this.logger.error(`SMS failed to ${phone}`, err.response?.data ?? err.message);
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 10) {
      return `233${digits.slice(1)}`;
    }
    if (digits.startsWith('233')) return digits;
    return digits;
  }
}
