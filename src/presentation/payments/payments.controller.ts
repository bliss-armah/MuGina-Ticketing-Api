import { Controller, Post, Get, Param, Headers, Req, HttpCode, RawBodyRequest, BadRequestException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from '../../application/payments/payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paystack webhook handler' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);
    if (!signature) throw new BadRequestException('Missing webhook signature');

    if (!this.paymentsService.verifySignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Respond 200 immediately — Paystack marks delivery failed if no reply within ~30s
    setImmediate(() => {
      this.paymentsService.processWebhookAsync(rawBody).catch((err: unknown) => {
        this.logger.error('Webhook processing failed', err instanceof Error ? err.message : err);
      });
    });

    return { status: 'ok' };
  }

  @Get('verify/:reference')
  @ApiOperation({ summary: 'Verify payment by reference' })
  verify(@Param('reference') reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }
}
