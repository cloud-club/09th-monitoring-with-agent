import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { HttpExceptionFilter } from './http/http-exception.filter'

const PORT = 8080

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule)
  app.useGlobalFilters(new HttpExceptionFilter())

  await app.listen(PORT)
}

void bootstrap()
