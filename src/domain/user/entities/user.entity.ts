export enum UserRole {
  ORGANIZER = 'ORGANIZER',
  ATTENDEE = 'ATTENDEE',
  GATE_AGENT = 'GATE_AGENT',
}

export class UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  isOrganizer(): boolean {
    return this.role === UserRole.ORGANIZER;
  }

  isGateAgent(): boolean {
    return this.role === UserRole.GATE_AGENT;
  }
}
