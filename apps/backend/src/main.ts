import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

import { HttpExceptionFilter } from './http/http-exception.filter';
import 'reflect-metadata';

const PORT = 8080;

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	app.useGlobalFilters(new HttpExceptionFilter());

	await app.listen(PORT);
}

void bootstrap();
