import process from 'node:process';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

import { HttpExceptionFilter } from './http/http-exception.filter';
import { setupOpenTelemetry, shutdownOpenTelemetry } from './telemetry/opentelemetry';
import 'reflect-metadata';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '8080');

async function bootstrap(): Promise<void> {
	setupOpenTelemetry();
	const app = await NestFactory.create(AppModule);
	app.useGlobalFilters(new HttpExceptionFilter());
	app.enableShutdownHooks();

	const closeTelemetry = async (): Promise<void> => {
		await shutdownOpenTelemetry();
	};

	process.once('SIGTERM', () => {
		void closeTelemetry();
	});

	process.once('SIGINT', () => {
		void closeTelemetry();
	});

	await app.listen(PORT, HOST);
}

void bootstrap();
