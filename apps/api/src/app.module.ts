import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { appConfig, databaseConfig, validateEnv } from './config';
import { PlatformModule } from './platform';
import { SchedulingModule } from './scheduling';
import { GymModule } from './gym';
import { ResourcesModule } from './resources';
import { GlobalSanitizationValidationPipe } from './common/pipes';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig],
    }),
    PlatformModule,
    SchedulingModule,
    GymModule,
    ResourcesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useClass: GlobalSanitizationValidationPipe,
    },
  ],
})
export class AppModule {}
