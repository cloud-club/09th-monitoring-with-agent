import type { Request } from 'express';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { AppLoggerService } from '../logging/app-logger.service';

import { IssueService } from './issue.service';

type TogglePaymentPgFormatIssueBody = {
	enabled?: unknown;
};

@Controller('/api/issues')
export class IssueController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(IssueService) private readonly issueService: IssueService,
	) {}

	@Get('/payment-pg-format')
	public getPaymentPgFormatIssue() {
		return ok({
			issue: 'payment-pg-format',
			...this.issueService.getPaymentPgFormatIssue(),
		});
	}

	@Post('/payment-pg-format')
	@HttpCode(HttpStatus.OK)
	public setPaymentPgFormatIssue(@Req() request: Request, @Body() body: TogglePaymentPgFormatIssueBody) {
		const enabled = body.enabled === true;
		const nextState = this.issueService.setPaymentPgFormatIssue(enabled);

		this.appLogger.logDomainEvent({
			request,
			eventName: 'issue.payment_pg_format.toggled',
			result: enabled ? 'enabled' : 'disabled',
			fields: {
				issue: 'payment-pg-format',
			},
		});

		return ok({
			issue: 'payment-pg-format',
			...nextState,
		});
	}
}
