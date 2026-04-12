import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  paidAt: string;
  metadata: Record<string, any>;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(params: {
    email: string;
    amount: number; // in kobo (pesewas * 100)
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<PaystackInitializeResponse> {
    try {
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: params.email,
          amount: Math.round(params.amount * 100), // convert to pesewas
          reference: params.reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
          currency: 'GHS',
        },
        { headers: this.headers },
      );

      const { data } = response.data;
      return {
        authorizationUrl: data.authorization_url,
        accessCode: data.access_code,
        reference: data.reference,
      };
    } catch (error: any) {
      this.logger.error('Paystack initialize failed', error.response?.data);
      throw new BadRequestException('Payment initialization failed');
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        { headers: this.headers },
      );

      const { data } = response.data;
      return {
        status: data.status,
        reference: data.reference,
        amount: data.amount / 100, // convert back from pesewas
        currency: data.currency,
        channel: data.channel,
        paidAt: data.paid_at,
        metadata: data.metadata || {},
      };
    } catch (error: any) {
      this.logger.error('Paystack verify failed', error.response?.data);
      throw new BadRequestException('Payment verification failed');
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET', this.secretKey);
    const hash = crypto.createHmac('sha512', webhookSecret).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      // timingSafeEqual throws if buffers differ in length (i.e. malformed signature)
      return false;
    }
  }
}
