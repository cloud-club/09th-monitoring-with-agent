import type { Request, Response } from 'express';
import type { PaymentAttemptListResponse, PaymentAttemptResponse } from './payment.controller.types';
import type { PaymentOutcome } from './payment.query';
import process from 'node:process';

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';

import { ok } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';
import { AppLoggerService } from '../logging/app-logger.service';
import { incrementPaymentAttempt, observePaymentProcessingLatency } from '../metrics/metrics-registry';
import { BuyerAccessGuard } from '../request-context/buyer-access.guard';
import { getRequestContext } from '../request-context/request-context';

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
		let requestKey: string;
		let outcome: PaymentOutcome;
		let failureCode: string | null;

		try {
			requestKey = parseRequestKey(body.requestKey);
			outcome = parseOutcome(body.outcome);
			failureCode = parseFailureCode(outcome, body.failureCode);
		}
		catch (error) {
			if (error instanceof HttpError && error.code === ERROR_CODES.VALIDATION_ERROR) {
				incrementPaymentAttempt('validation_error');
			}

			throw error;
		}

		const customerId = getBuyerCustomerId(request);
		this.appLogger.logDomainEvent({
			request,
			eventName: 'payment.started',
			result: 'started',
			fields: {
				order_id: orderId,
			},
		});
		const paymentProcessingStartTime = process.hrtime.bigint();

		let attemptResult: { attempt: Awaited<ReturnType<PaymentService['createAttempt']>>['attempt']; created: boolean };
		try {
			attemptResult = await this.paymentService.createAttempt(customerId, orderId, requestKey, outcome, failureCode);
			observePaymentProcessingLatency({
				outcome: 'success',
				durationSeconds: Number(process.hrtime.bigint() - paymentProcessingStartTime) / 1_000_000_000,
			});
		}
		catch (error) {
			observePaymentProcessingLatency({
				outcome: 'failed',
				durationSeconds: Number(process.hrtime.bigint() - paymentProcessingStartTime) / 1_000_000_000,
			});
			throw error;
		}

		const { attempt, created } = attemptResult;

		if (created) {
			incrementPaymentAttempt('started');
			incrementPaymentAttempt(outcome === 'success' ? 'succeeded' : 'failed');
		}

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
