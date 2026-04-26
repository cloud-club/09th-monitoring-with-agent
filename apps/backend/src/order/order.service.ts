import type { CartCheckoutRow } from './order.repository';

import type { OrderView } from './order.types';
import { Inject, Injectable } from '@nestjs/common';
import { CustomerLockService } from '../application/customer-lock.service';

import { DemoAddressPolicy } from '../application/demo-address-policy';
import { HttpError, StateConflictError } from '../http/http-error';
import { OrderRepository } from './order.repository';

function createConflictError(message: string, details?: unknown): HttpError {
	return new StateConflictError(message, details);
}

function assertCheckoutCartIsAvailable(cartRows: readonly CartCheckoutRow[], cartId: string): void {
	if (cartRows.length === 0) {
		throw createConflictError('Cart cannot be checked out', { cart_id: cartId });
	}

	for (const row of cartRows) {
		if (
			row.current_snapshot_id === null
			|| row.product_id === null
			|| row.title === null
			|| row.variant_name === null
			|| row.available_quantity === null
			|| row.current_price === null
			|| row.seller_customer_id === null
		) {
			throw createConflictError('Cart item is unavailable', {
				cart_item_id: row.cart_item_id,
				variant_id: row.variant_id,
			});
		}

		if (row.snapshot_id !== row.current_snapshot_id) {
			throw createConflictError('Cart item is unavailable', {
				cart_item_id: row.cart_item_id,
				variant_id: row.variant_id,
			});
		}

		if (row.available_quantity < row.quantity) {
			throw createConflictError('Cart item is unavailable', {
				variant_id: row.variant_id,
				available_quantity: row.available_quantity,
			});
		}
	}
}

@Injectable()
export class OrderService {
	public constructor(
		@Inject(CustomerLockService) private readonly customerLock: CustomerLockService,
		@Inject(DemoAddressPolicy) private readonly addressPolicy: DemoAddressPolicy,
		@Inject(OrderRepository) private readonly orderRepository: OrderRepository,
	) {}

	public async createOrder(customerId: string, cartId: string, addressId: string): Promise<OrderView> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			this.addressPolicy.assertCustomerOwnsAddress(customerId, addressId);

			const cartRows = await this.orderRepository.loadCheckoutCart(entityManager, cartId, customerId);
			assertCheckoutCartIsAvailable(cartRows, cartId);

			const orderId = await this.orderRepository.insertOrderFromCart(entityManager, customerId, addressId, cartRows);
			return this.orderRepository.loadOrderView(entityManager, orderId, customerId);
		});
	}

	public async getOrder(customerId: string, orderId: string): Promise<OrderView> {
		return this.customerLock.runWithCustomerLock(customerId, async entityManager => this.orderRepository.loadOrderView(entityManager, orderId, customerId));
	}
}
