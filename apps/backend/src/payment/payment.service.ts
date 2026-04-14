import { randomUUID } from 'node:crypto';

import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

import { HttpError, NotFoundError, StateConflictError } from '../http/http-error';

import type { PaymentAttemptView } from './payment.types';
import type { PaymentOutcome } from './payment.query';

type PaymentAttemptRow = {
	readonly payment_attempt_id: string;
	readonly order_id: string;
	readonly request_key: string;
	readonly status: 'succeeded' | 'failed';
	readonly amount: string;
	readonly failure_code: string | null;
	readonly created_at: string | Date;
};

type OrderOwnershipRow = {
	readonly order_id: string;
	readonly customer_id: string;
	readonly address_id: string | null;
	readonly cash: string;
	readonly has_payment: boolean;
};

const PAYMENT_ATTEMPTS_SQL = `
	SELECT
		pa.id AS payment_attempt_id,
		pa.order_id,
		pa.request_key,
		pa.status,
		pa.amount::text AS amount,
		pa.failure_code,
		pa.created_at
	FROM payment_attempts pa
	WHERE pa.order_id = ?
	ORDER BY pa.created_at ASC, pa.id ASC
`;

function mapAttemptRow(row: PaymentAttemptRow): PaymentAttemptView {
	return {
		payment_attempt_id: row.payment_attempt_id,
		order_id: row.order_id,
		request_key: row.request_key,
		status: row.status,
		amount: Number(row.amount).toFixed(2),
		failure_code: row.failure_code,
		created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
	};
}

function createConflict(message: string, details?: unknown): HttpError {
	return new StateConflictError(message, details);
}

@Injectable()
export class PaymentService {
	public constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

	private async withCustomerLock<T>(customerId: string, operation: (entityManager: EntityManager) => Promise<T>): Promise<T> {
		return this.entityManager.transactional(async (entityManager) => {
			await entityManager.getConnection().execute(
				'SELECT pg_advisory_xact_lock(hashtext(?))',
				[customerId],
				'get',
			);

			return operation(entityManager);
		});
	}

	private async loadOwnedOrder(entityManager: EntityManager, customerId: string, orderId: string): Promise<OrderOwnershipRow> {
		const rows = await entityManager.getConnection().execute<OrderOwnershipRow>(
			`SELECT
				o.id AS order_id,
				o.customer_id,
				o.address_id,
				o.cash::text AS cash,
				CASE WHEN payment.id IS NULL THEN false ELSE true END AS has_payment
			 FROM orders o
			 LEFT JOIN order_payments payment ON payment.order_id = o.id
			 WHERE o.id = ?
			 AND o.customer_id = ?
			 AND o.deleted_at IS NULL`,
			[orderId, customerId],
			'all',
		);

		const [order] = rows;
		if (order === undefined) {
			throw new NotFoundError('Order not found');
		}

		return order;
	}

	public async listAttempts(customerId: string, orderId: string): Promise<PaymentAttemptView[]> {
		return this.withCustomerLock(customerId, async (entityManager) => {
			await this.loadOwnedOrder(entityManager, customerId, orderId);
			const rows = await entityManager.getConnection().execute<PaymentAttemptRow>(PAYMENT_ATTEMPTS_SQL, [orderId], 'all');
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
		return this.withCustomerLock(customerId, async (entityManager) => {
			const order = await this.loadOwnedOrder(entityManager, customerId, orderId);
			const existingAttempts = await entityManager.getConnection().execute<PaymentAttemptRow>(PAYMENT_ATTEMPTS_SQL, [orderId], 'all');

			const existingAttempt = existingAttempts.find((attempt: PaymentAttemptRow) => attempt.request_key === requestKey);
			if (existingAttempt !== undefined) {
				const conflictingReplay = existingAttempt.status !== (outcome === 'success' ? 'succeeded' : 'failed')
					|| existingAttempt.failure_code !== failureCode;
				if (conflictingReplay) {
					throw createConflict('requestKey already exists with a different payload', {
						order_id: orderId,
						request_key: requestKey,
					});
				}

				return { attempt: mapAttemptRow(existingAttempt), created: false };
			}

			if (order.has_payment) {
				throw createConflict('Paid orders cannot accept new payment attempts', {
					order_id: orderId,
					request_key: requestKey,
				});
			}

			const paymentAttemptId = randomUUID();
			const attemptStatus = outcome === 'success' ? 'succeeded' : 'failed';
			const insertedRows = await entityManager.getConnection().execute<{ payment_attempt_id: string }>(
				`INSERT INTO payment_attempts (id, order_id, request_key, status, amount, failure_code, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, NOW())
				 ON CONFLICT (order_id, request_key) DO NOTHING
				 RETURNING id AS payment_attempt_id`,
				[paymentAttemptId, orderId, requestKey, attemptStatus, order.cash, failureCode],
				'all',
			);

			const inserted = insertedRows.length > 0;
			if (!inserted) {
				const replayedAttempts = await entityManager.getConnection().execute<PaymentAttemptRow>(PAYMENT_ATTEMPTS_SQL, [orderId], 'all');
				const replayedAttempt = replayedAttempts.find((attempt: PaymentAttemptRow) => attempt.request_key === requestKey);
				if (replayedAttempt === undefined) {
					throw new Error('Payment attempt insert conflicted but no replay row could be loaded');
				}

				const conflictingReplay = replayedAttempt.status !== attemptStatus || replayedAttempt.failure_code !== failureCode;
				if (conflictingReplay) {
					throw createConflict('requestKey already exists with a different payload', {
						order_id: orderId,
						request_key: requestKey,
					});
				}

				return { attempt: mapAttemptRow(replayedAttempt), created: false };
			}

			if (outcome === 'success') {
				await entityManager.getConnection().execute(
					`INSERT INTO order_payments (id, order_id, address_id, paid_at, created_at)
					 VALUES (?, ?, ?, NOW(), NOW())`,
					[randomUUID(), orderId, order.address_id],
					'run',
				);
			}

			const attempts = await entityManager.getConnection().execute<PaymentAttemptRow>(PAYMENT_ATTEMPTS_SQL, [orderId], 'all');
			const createdAttempt = attempts.find((attempt: PaymentAttemptRow) => attempt.payment_attempt_id === paymentAttemptId);
			if (createdAttempt === undefined) {
				throw new Error('Created payment attempt could not be reloaded');
			}

			return { attempt: mapAttemptRow(createdAttempt), created: true };
		});
	}
}
