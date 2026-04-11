import { Module } from '@nestjs/common';
import { ScannerController } from './scanner.controller';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [ScannerController],
})
export class ScannerModule {}
