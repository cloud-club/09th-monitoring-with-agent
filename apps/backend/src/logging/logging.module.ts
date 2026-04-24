import { Global, Module } from '@nestjs/common';

import { AppLoggerService } from './app-logger.service';
import { LogHeartbeatService } from './log-heartbeat.service';

@Global()
@Module({
	providers: [AppLoggerService, LogHeartbeatService],
	exports: [AppLoggerService],
})
export class LoggingModule {}
