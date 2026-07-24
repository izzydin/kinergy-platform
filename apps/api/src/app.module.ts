import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { appConfig, databaseConfig, validateEnv } from './config';
import { PlatformModule } from './platform';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig],
    }),
    PlatformModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
