import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordResetMailer } from './password-reset-mailer.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>('MAX_AVATAR_BYTES') ?? 2 * 1024 * 1024,
          files: 1,
          fields: 1,
          fieldNameSize: 100,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PasswordResetMailer, RateLimitGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
