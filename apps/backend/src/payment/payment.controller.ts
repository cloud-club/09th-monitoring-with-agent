import type { Request } from 'express';
import type { PaymentAttemptListResponse, PaymentAttemptResponse } from './payment.controller.types';

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { ok } from '../http/contracts';
import { AppLoggerService } from '../logging/app-logger.service';
import { getRequestContext } from '../request-context/request-context';
import { BuyerAccessGuard } from '../request-context/buyer-access.guard';

import { parseFailureCode, parseOutcome, parseRequestKey } from './payment.query';
import { PaymentService } from './payment.service';

type CreatePaymentAttemptBody = {
	requestKey?: unknown;
	outcome?: unknown;
	failureCode?: unknown;
};

function getBuyerCustomerId(request: Request): string {
	const context = getRequestContext(request);
	if (context.actor.type !== 'buyer') {
		throw new Error('Buyer context expected after BuyerAccessGuard');
	}

	return context.actor.customerId;
}

@Controller('/api/orders/:orderId/payment-attempts')
@UseGuards(BuyerAccessGuard)
export class PaymentController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(PaymentService) private readonly paymentService: PaymentService,
	) {}

	@Get()
	public async listAttempts(@Req() request: Request, @Param('orderId') orderId: string): Promise<PaymentAttemptListResponse> {
		const attempts = await this.paymentService.listAttempts(getBuyerCustomerId(request), orderId);
		return ok({ attempts });
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async createAttempt(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
		@Param('orderId') orderId: string,
		@Body() body: CreatePaymentAttemptBody,
	): Promise<PaymentAttemptResponse> {
		const requestKey = parseRequestKey(body.requestKey);
		const outcome = parseOutcome(body.outcome);
		const failureCode = parseFailureCode(outcome, body.failureCode);
		const customerId = getBuyerCustomerId(request);
		this.appLogger.logDomainEvent({
			request,
			eventName: 'payment.started',
			result: 'started',
			fields: {
				order_id: orderId,
			},
		});
		const { attempt, created } = await this.paymentService.createAttempt(customerId, orderId, requestKey, outcome, failureCode);

		response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
		this.appLogger.logDomainEvent({
			request,
			eventName: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
			result: created ? 'success' : 'replayed',
			errorCode: outcome === 'fail' ? failureCode : null,
			fields: {
				order_id: orderId,
				payment_id: attempt.payment_attempt_id,
			},
		});

		return ok({ attempt });
	}
}
