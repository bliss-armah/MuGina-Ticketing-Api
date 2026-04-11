import { Controller, Post, Get, Param, Headers, Req, HttpCode, RawBodyRequest, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from '../../application/payments/payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paystack webhook handler' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);
    if (!signature) throw new BadRequestException('Missing webhook signature');
    await this.paymentsService.handleWebhook(rawBody, signature);
    return { status: 'ok' };
  }

  @Get('verify/:reference')
  @ApiOperation({ summary: 'Verify payment by reference' })
  verify(@Param('reference') reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }
}
