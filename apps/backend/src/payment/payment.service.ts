import type { PaymentOutcome } from './payment.query';

import type { PaymentAttemptRow } from './payment.repository';
import type { PaymentAttemptView } from './payment.types';

import { Inject, Injectable } from '@nestjs/common';
import { CustomerLockService } from '../application/customer-lock.service';
import { HttpError, StateConflictError } from '../http/http-error';
import { mapAttemptRow, PaymentRepository } from './payment.repository';

function createConflict(message: string, details?: unknown): HttpError {
	return new StateConflictError(message, details);
}

function toAttemptStatus(outcome: PaymentOutcome): 'succeeded' | 'failed' {
	return outcome === 'success' ? 'succeeded' : 'failed';
}

function assertReplayMatches(
	existingAttempt: PaymentAttemptRow,
	outcome: PaymentOutcome,
	failureCode: string | null,
	orderId: string,
	requestKey: string,
): void {
	const conflictingReplay = existingAttempt.status !== toAttemptStatus(outcome) || existingAttempt.failure_code !== failureCode;
	if (conflictingReplay) {
		throw createConflict('requestKey already exists with a different payload', {
			order_id: orderId,
			request_key: requestKey,
		});
	}
}

@Injectable()
export class PaymentService {
	public constructor(
		@Inject(CustomerLockService) private readonly customerLock: CustomerLockService,
		@Inject(PaymentRepository) private readonly paymentRepository: PaymentRepository,
	) {}

	public async listAttempts(customerId: string, orderId: string): Promise<PaymentAttemptView[]> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			await this.paymentRepository.loadOwnedOrder(entityManager, customerId, orderId);
			const rows = await this.paymentRepository.listAttemptRows(entityManager, orderId);
			return rows.map(mapAttemptRow);
		});
	}

	public async createAttempt(
		customerId: string,
		orderId: string,
		requestKey: string,
		outcome: PaymentOutcome,
		failureCode: string | null,
	): Promise<{ attempt: PaymentAttemptView; created: boolean }> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			const order = await this.paymentRepository.loadOwnedOrder(entityManager, customerId, orderId);
			const existingAttempts = await this.paymentRepository.listAttemptRows(entityManager, orderId);

			const existingAttempt = existingAttempts.find((attempt: PaymentAttemptRow) => attempt.request_key === requestKey);
			if (existingAttempt !== undefined) {
				assertReplayMatches(existingAttempt, outcome, failureCode, orderId, requestKey);
				return { attempt: mapAttemptRow(existingAttempt), created: false };
			}

			if (order.has_payment) {
				throw createConflict('Paid orders cannot accept new payment attempts', {
					order_id: orderId,
					request_key: requestKey,
				});
			}

			const attemptStatus = toAttemptStatus(outcome);
			const paymentAttemptId = await this.paymentRepository.insertAttempt(
				entityManager,
				orderId,
				requestKey,
				attemptStatus,
				order.cash,
				failureCode,
			);

			if (paymentAttemptId === null) {
				const replayedAttempts = await this.paymentRepository.listAttemptRows(entityManager, orderId);
				const replayedAttempt = replayedAttempts.find((attempt: PaymentAttemptRow) => attempt.request_key === requestKey);
				if (replayedAttempt === undefined) {
					throw new Error('Payment attempt insert conflicted but no replay row could be loaded');
				}

				assertReplayMatches(replayedAttempt, outcome, failureCode, orderId, requestKey);
				return { attempt: mapAttemptRow(replayedAttempt), created: false };
			}

			if (outcome === 'success') {
				await this.paymentRepository.insertOrderPayment(entityManager, orderId, order.address_id);
			}

			const attempts = await this.paymentRepository.listAttemptRows(entityManager, orderId);
			const createdAttempt = attempts.find((attempt: PaymentAttemptRow) => attempt.payment_attempt_id === paymentAttemptId);
			if (createdAttempt === undefined) {
				throw new Error('Created payment attempt could not be reloaded');
			}

			return { attempt: mapAttemptRow(createdAttempt), created: true };
		});
	}
}
