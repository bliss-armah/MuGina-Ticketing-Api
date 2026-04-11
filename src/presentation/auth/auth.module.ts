import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from '../../application/auth/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserPrismaRepository } from '../../infrastructure/database/repositories/user.prisma.repository';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: UserPrismaRepository },
  ],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
