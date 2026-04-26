import { Module } from '@nestjs/common';

import { LoggingModule } from '../logging/logging.module';

import { IssueController } from './issue.controller';
import { IssueService } from './issue.service';

@Module({
	imports: [LoggingModule],
	controllers: [IssueController],
	providers: [IssueService],
	exports: [IssueService],
})
export class IssueModule {}
