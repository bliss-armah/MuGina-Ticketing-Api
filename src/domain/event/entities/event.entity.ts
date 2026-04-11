export class EventEntity {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  location: string;
  bannerUrl?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;

  isUpcoming(): boolean {
    return this.startDate > new Date();
  }
}
