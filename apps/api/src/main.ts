import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';
import { GlobalSanitizationValidationPipe } from './common/pipes';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const globalPrefix = configService.get<string>('API_PREFIX', 'api/v1');

  // Security & Optimization Middleware
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Prefix, Exception Filter & Pipe
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new GlobalSanitizationValidationPipe());

  // OpenAPI Swagger Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kinergy Platform API')
    .setDescription('Enterprise Energy & Sustainability Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful Shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  logger.log(`📚 Swagger documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('BootstrapError');
  logger.error('Failed to start application', err);
  process.exit(1);
});
