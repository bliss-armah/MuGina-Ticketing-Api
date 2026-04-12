import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from '../../application/events/events.service';
import { EventPrismaRepository } from '../../infrastructure/database/repositories/event.prisma.repository';
import { EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { CloudinaryModule } from '../../infrastructure/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    { provide: EVENT_REPOSITORY, useClass: EventPrismaRepository },
  ],
  exports: [EventsService, { provide: EVENT_REPOSITORY, useClass: EventPrismaRepository }],
})
export class EventsModule {}
