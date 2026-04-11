import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards,
  UploadedFile, UseInterceptors, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { EventsService } from '../../application/events/events.service';
import { CreateEventDto } from '../../application/events/dto/create-event.dto';
import { UpdateEventDto } from '../../application/events/dto/update-event.dto';
import { CreateTicketTypeDto } from '../../application/events/dto/create-ticket-type.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List published events' })
  findAll(@Query('organizerId') organizerId?: string) {
    if (organizerId) return this.eventsService.findByOrganizer(organizerId);
    return this.eventsService.findAll(true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('banner'))
  @ApiOperation({ summary: 'Create event (organizer only)' })
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateEventDto,
    @UploadedFile() banner?: Express.Multer.File,
  ) {
    return this.eventsService.create(user.id, dto, banner);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('banner'))
  @ApiOperation({ summary: 'Update event' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateEventDto,
    @UploadedFile() banner?: Express.Multer.File,
  ) {
    return this.eventsService.update(id, user.id, dto, banner);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete event' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.eventsService.delete(id, user.id);
  }

  @Post(':id/ticket-types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add ticket type to event' })
  addTicketType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.eventsService.addTicketType(id, user.id, dto);
  }

  @Get(':id/ticket-types')
  @ApiOperation({ summary: 'Get ticket types for event' })
  getTicketTypes(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getTicketTypes(id);
  }

  @Get('organizer/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Organizer dashboard' })
  getDashboard(@CurrentUser() user: any) {
    return this.eventsService.getDashboard(user.id);
  }
}
