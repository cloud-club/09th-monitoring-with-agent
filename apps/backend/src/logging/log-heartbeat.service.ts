import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { refreshLogHeartbeatMetric } from '../metrics/metrics-registry';

import { AppLoggerService } from './app-logger.service';

const HEARTBEAT_INTERVAL_MS = 15_000;

@Injectable()
export class LogHeartbeatService implements OnModuleInit, OnModuleDestroy {
	private heartbeatTimer: NodeJS.Timeout | undefined;

	@Inject(AppLoggerService)
	private readonly appLogger!: AppLoggerService;

	public onModuleInit(): void {
		this.emitHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			this.emitHeartbeat();
		}, HEARTBEAT_INTERVAL_MS);
		this.heartbeatTimer.unref();
	}

	public onModuleDestroy(): void {
		if (this.heartbeatTimer !== undefined) {
			clearInterval(this.heartbeatTimer);
		}
	}

	private emitHeartbeat(): void {
		refreshLogHeartbeatMetric();
		this.appLogger.logSystemEvent({
			eventName: 'monitoring.log_heartbeat',
			result: 'heartbeat',
			fields: {
				heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
			},
		});
	}
}
