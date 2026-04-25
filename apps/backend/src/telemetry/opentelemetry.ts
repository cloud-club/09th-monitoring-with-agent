import type { Tracer } from '@opentelemetry/api';

import process from 'node:process';
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const TRACER_NAME = 'mwa-backend-http';

let tracer: Tracer = trace.getTracer(TRACER_NAME);
let tracerProvider: NodeTracerProvider | undefined;

function getTraceEndpoint(): string | undefined {
	return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

export function setupOpenTelemetry(): void {
	if (tracerProvider !== undefined || process.env.OTEL_ENABLED === 'false') {
		return;
	}

	const traceEndpoint = getTraceEndpoint();
	if (traceEndpoint === undefined || traceEndpoint.length === 0) {
		return;
	}

	if (process.env.OTEL_DEBUG === 'true') {
		diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
	}

	const resource = new Resource({
		[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'mwa-backend',
		[ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
	});

	const provider = new NodeTracerProvider({ resource });
	provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: traceEndpoint })));
	provider.register();

	tracerProvider = provider;
	tracer = trace.getTracer(TRACER_NAME);
}

export function getBackendTracer(): Tracer {
	return tracer;
}

export async function shutdownOpenTelemetry(): Promise<void> {
	if (tracerProvider === undefined) {
		return;
	}

	await tracerProvider.shutdown();
	tracerProvider = undefined;
}
