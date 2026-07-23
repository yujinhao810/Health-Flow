import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  app.enableCors({ origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
