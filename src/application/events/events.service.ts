import { Injectable, NotFoundException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { IEventRepository, EVENT_REPOSITORY } from '../../domain/event/repositories/event.repository.interface';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepo: IEventRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async findAll(isPublished?: boolean) {
    return this.eventRepo.findAll({ isPublished: isPublished ?? true });
  }

  async findByOrganizer(organizerId: string) {
    return this.eventRepo.findAll({ organizerId });
  }

  async findById(id: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(organizerId: string, dto: CreateEventDto, bannerFile?: Express.Multer.File) {
    let bannerUrl: string | undefined;

    if (bannerFile) {
      const result = await this.cloudinary.uploadImage(bannerFile, 'mugina-events');
      bannerUrl = result.secure_url;
    }

    const event = await this.eventRepo.create({
      organizerId,
      title: dto.title,
      description: dto.description,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      location: dto.location,
      bannerUrl,
      isPublished: dto.isPublished ?? false,
    });

    this.logger.log(`Event created: ${event.id} by organizer ${organizerId}`);
    return event;
  }

  async update(id: string, organizerId: string, dto: UpdateEventDto, bannerFile?: Express.Multer.File) {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Access denied');

    let bannerUrl = event.bannerUrl;
    if (bannerFile) {
      const result = await this.cloudinary.uploadImage(bannerFile, 'mugina-events');
      bannerUrl = result.secure_url;
    }

    return this.eventRepo.update(id, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      bannerUrl,
    });
  }

  async delete(id: string, organizerId: string) {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Access denied');
    await this.eventRepo.delete(id);
    return { message: 'Event deleted' };
  }

  async addTicketType(eventId: string, organizerId: string, dto: CreateTicketTypeDto) {
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Access denied');
    return this.eventRepo.createTicketType({ eventId, ...dto });
  }

  async getTicketTypes(eventId: string) {
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundException('Event not found');
    return this.eventRepo.findTicketTypes(eventId);
  }

  async getDashboard(organizerId: string) {
    const events = await this.eventRepo.findAll({ organizerId });
    return events;
  }
}
