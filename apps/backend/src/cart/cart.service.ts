import type { CartView } from './cart.types';

import { Inject, Injectable } from '@nestjs/common';
import { CustomerLockService } from '../application/customer-lock.service';
import { ERROR_CODES } from '../http/error-codes';

import { HttpError, NotFoundError, StateConflictError } from '../http/http-error';
import { CartRepository } from './cart.repository';
import { CART_ITEM_MAX_QUANTITY } from './cart.types';

function createUnavailableError(message: string, details: unknown): HttpError {
	return new StateConflictError(message, details);
}

function assertQuantityWithinAvailable(variantId: string, availableQuantity: number, quantity: number): void {
	if (availableQuantity < quantity) {
		throw createUnavailableError('Cart item is unavailable', {
			variant_id: variantId,
			available_quantity: availableQuantity,
		});
	}
}

function assertWithinCartItemLimit(quantity: number): void {
	if (quantity > CART_ITEM_MAX_QUANTITY) {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [{
				path: 'quantity',
				message: `quantity must be an integer between 1 and ${CART_ITEM_MAX_QUANTITY}`,
				value: quantity,
			}],
		});
	}
}

@Injectable()
export class CartService {
	public constructor(
		@Inject(CustomerLockService) private readonly customerLock: CustomerLockService,
		@Inject(CartRepository) private readonly cartRepository: CartRepository,
	) {}

	public async getCart(customerId: string): Promise<CartView> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			const cartId = await this.cartRepository.ensureActiveCartId(entityManager, customerId);
			return this.cartRepository.loadCartView(entityManager, cartId);
		});
	}

	public async addItem(customerId: string, variantId: string, quantity: number): Promise<CartView> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			const cartId = await this.cartRepository.ensureActiveCartId(entityManager, customerId);
			const variant = await this.cartRepository.loadVariant(entityManager, variantId);

			assertQuantityWithinAvailable(variantId, variant.available_quantity, quantity);

			const existing = await this.cartRepository.findItemByVariant(entityManager, cartId, variantId);
			if (existing !== undefined) {
				const nextQuantity = existing.quantity + quantity;
				assertWithinCartItemLimit(nextQuantity);
				assertQuantityWithinAvailable(variantId, variant.available_quantity, nextQuantity);

				await this.cartRepository.updateItemQuantity(entityManager, existing.cart_item_id, nextQuantity);
				return this.cartRepository.loadCartView(entityManager, cartId);
			}

			await this.cartRepository.insertItem(entityManager, cartId, variant, quantity);
			return this.cartRepository.loadCartView(entityManager, cartId);
		});
	}

	public async updateItem(customerId: string, cartItemId: string, quantity: number): Promise<CartView> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			const activeCartId = await this.cartRepository.findActiveCartId(entityManager, customerId);
			if (activeCartId === null) {
				throw new NotFoundError('Cart item not found');
			}

			const cart = await this.cartRepository.loadCartView(entityManager, activeCartId);
			const line = cart.items.find(item => item.cart_item_id === cartItemId);

			if (line === undefined) {
				throw new NotFoundError('Cart item not found');
			}

			assertQuantityWithinAvailable(line.variant_id, line.available_quantity, quantity);

			await this.cartRepository.updateItemQuantity(entityManager, cartItemId, quantity);
			return this.cartRepository.loadCartView(entityManager, cart.cart_id);
		});
	}

	public async deleteItem(customerId: string, cartItemId: string): Promise<CartView> {
		return this.customerLock.runWithCustomerLock(customerId, async (entityManager) => {
			const activeCartId = await this.cartRepository.findActiveCartId(entityManager, customerId);
			if (activeCartId === null) {
				throw new NotFoundError('Cart item not found');
			}

			const cart = await this.cartRepository.loadCartView(entityManager, activeCartId);
			const line = cart.items.find(item => item.cart_item_id === cartItemId);

			if (line === undefined) {
				throw new NotFoundError('Cart item not found');
			}

			await this.cartRepository.deleteItem(entityManager, cartItemId);
			return this.cartRepository.loadCartView(entityManager, cart.cart_id);
		});
	}
}
