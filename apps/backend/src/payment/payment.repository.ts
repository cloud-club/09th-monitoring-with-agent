import type { EntityManager } from '@mikro-orm/core';
import type { PaymentAttemptView } from './payment.types';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../http/http-error';

export type PaymentAttemptRow = {
	readonly payment_attempt_id: string;
	readonly order_id: string;
	readonly request_key: string;
	readonly status: 'succeeded' | 'failed';
	readonly amount: string;
	readonly failure_code: string | null;
	readonly created_at: string | Date;
};

export type OrderOwnershipRow = {
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

export function mapAttemptRow(row: PaymentAttemptRow): PaymentAttemptView {
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

@Injectable()
export class PaymentRepository {
	public async loadOwnedOrder(entityManager: EntityManager, customerId: string, orderId: string): Promise<OrderOwnershipRow> {
		const rows = await entityManager.getConnection().execute(
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
		) as unknown as OrderOwnershipRow[];

		const [order] = rows;
		if (order === undefined) {
			throw new NotFoundError('Order not found');
		}

		return order;
	}

	public async listAttemptRows(entityManager: EntityManager, orderId: string): Promise<PaymentAttemptRow[]> {
		return await entityManager.getConnection().execute(PAYMENT_ATTEMPTS_SQL, [orderId], 'all') as unknown as PaymentAttemptRow[];
	}

	public async insertAttempt(
		entityManager: EntityManager,
		orderId: string,
		requestKey: string,
		status: 'succeeded' | 'failed',
		amount: string,
		failureCode: string | null,
	): Promise<string | null> {
		const paymentAttemptId = randomUUID();
		const insertedRows = await entityManager.getConnection().execute(
			`INSERT INTO payment_attempts (id, order_id, request_key, status, amount, failure_code, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, NOW())
			 ON CONFLICT (order_id, request_key) DO NOTHING
			 RETURNING id AS payment_attempt_id`,
			[paymentAttemptId, orderId, requestKey, status, amount, failureCode],
			'all',
		) as unknown as Array<{ payment_attempt_id: string }>;

		return insertedRows.length > 0 ? paymentAttemptId : null;
	}

	public async insertOrderPayment(entityManager: EntityManager, orderId: string, addressId: string | null): Promise<void> {
		await entityManager.getConnection().execute(
			`INSERT INTO order_payments (id, order_id, address_id, paid_at, created_at)
			 VALUES (?, ?, ?, NOW(), NOW())`,
			[randomUUID(), orderId, addressId],
			'run',
		);
	}
}
