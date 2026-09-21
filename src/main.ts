import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for base64 image uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  const configService = app.get(ConfigService);
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret) {
    console.error('FATAL: A variável de ambiente JWT_SECRET é obrigatória e não foi configurada.');
    process.exit(1);
  }

  // Set global prefix
  app.setGlobalPrefix('api');

  // Configure CORS from environment
  const allowedOriginsEnv = configService.get<string>('ALLOWED_ORIGINS');
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:4200'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable global validations
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Use global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Use global request logger
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();

