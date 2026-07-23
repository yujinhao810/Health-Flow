import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import type { AuthUser } from './auth.types';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit(5, 10 * 60 * 1000)
  @UseGuards(RateLimitGuard)
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post('login')
  @RateLimit(10, 60 * 1000)
  @UseGuards(RateLimitGuard)
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Post('forgot-password')
  @RateLimit(5, 10 * 60 * 1000)
  @UseGuards(RateLimitGuard)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(body);
  }

  @Post('reset-password')
  @RateLimit(10, 10 * 60 * 1000)
  @UseGuards(RateLimitGuard)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, body);
  }

  @Post('avatar')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.auth.uploadAvatar(user.id, file);
  }

  @Get('avatar/:filename')
  @UseGuards(AuthGuard)
  async avatar(@CurrentUser() user: AuthUser, @Param('filename') filename: string, @Res() res: Response) {
    const file = await this.auth.getAvatarFile(user, filename);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const stream = createReadStream(file.storagePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).end();
        return;
      }
      res.end();
    });
    stream.pipe(res);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(user.id, body);
  }

  @Patch('preferences')
  @UseGuards(AuthGuard)
  updatePreferences(@CurrentUser() user: AuthUser, @Body() body: UpdatePreferencesDto) {
    return this.auth.updatePreferences(user.id, body);
  }

  @Delete('account')
  @UseGuards(AuthGuard)
  deleteAccount(@CurrentUser() user: AuthUser) {
    return this.auth.deleteAccount(user.id);
  }
}
