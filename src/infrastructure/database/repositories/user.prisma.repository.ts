import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IUserRepository } from '../../../domain/user/repositories/user.repository.interface';
import { UserEntity, UserRole } from '../../../domain/user/entities/user.entity';

@Injectable()
export class UserPrismaRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(raw: any): UserEntity {
    const entity = new UserEntity();
    Object.assign(entity, {
      ...raw,
      role: raw.role as UserRole,
    });
    return entity;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toEntity(user) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toEntity(user) : null;
  }

  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email!,
        passwordHash: data.passwordHash!,
        firstName: data.firstName!,
        lastName: data.lastName!,
        phone: data.phone,
        role: data.role as any,
      },
    });
    return this.toEntity(user);
  }

  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: data as any,
    });
    return this.toEntity(user);
  }
}
