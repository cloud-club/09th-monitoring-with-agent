import type { Request } from 'express';
import type { CartResponse } from './cart.controller.types';

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { ok } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';
import { AppLoggerService } from '../logging/app-logger.service';
import { incrementCartAdd } from '../metrics/metrics-registry';
import { getRequestContext } from '../request-context/request-context';
import { BuyerAccessGuard } from '../request-context/buyer-access.guard';

import { parseCartQuantity, parseCartVariantId, parseRequiredCartQuantity } from './cart.query';
import { CartService } from './cart.service';

type CartItemMutationBody = {
	variantId?: string;
	quantity?: unknown;
};

function getBuyerCustomerId(request: Request): string {
	const context = getRequestContext(request);
	if (context.actor.type !== 'buyer') {
		throw new Error('Buyer context expected after BuyerAccessGuard');
	}
	return context.actor.customerId;
}

@Controller('/api/cart')
@UseGuards(BuyerAccessGuard)
export class CartController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(CartService) private readonly cartService: CartService,
	) {}

	@Get()
	public async getCart(@Req() request: Request): Promise<CartResponse> {
		const cart = await this.cartService.getCart(getBuyerCustomerId(request));
		return ok({ cart });
	}

	@Post('/items')
	public async addCartItem(
		@Req() request: Request,
		@Body() body: CartItemMutationBody,
	): Promise<CartResponse> {
		try {
			const variantId = parseCartVariantId(body.variantId);
			const cart = await this.cartService.addItem(
				getBuyerCustomerId(request),
				variantId,
				parseCartQuantity(body.quantity),
			);

			incrementCartAdd('success');
			this.appLogger.logDomainEvent({
				request,
				eventName: 'cart.item_added',
				result: 'success',
				fields: {
					cart_id: cart.cart_id,
					variant_id: variantId,
				},
			});

			return ok({ cart });
		} catch (error) {
			if (error instanceof HttpError) {
				if (error.code === ERROR_CODES.VALIDATION_ERROR) {
					incrementCartAdd('validation_error');
				} else if (error.code === ERROR_CODES.STATE_CONFLICT) {
					incrementCartAdd('conflict');
				}
			}

			throw error;
		}
	}

	@Patch('/items/:cartItemId')
	public async updateCartItem(
		@Req() request: Request,
		@Param('cartItemId') cartItemId: string,
		@Body() body: CartItemMutationBody,
	): Promise<CartResponse> {
		const cart = await this.cartService.updateItem(
			getBuyerCustomerId(request),
			cartItemId,
			parseRequiredCartQuantity(body.quantity),
		);

		const updatedItem = cart.items.find((item) => item.cart_item_id === cartItemId);
		this.appLogger.logDomainEvent({
			request,
			eventName: 'cart.item_updated',
			result: 'success',
			fields: {
				cart_id: cart.cart_id,
				variant_id: updatedItem?.variant_id,
			},
		});

		return ok({ cart });
	}

	@Delete('/items/:cartItemId')
	public async deleteCartItem(
		@Req() request: Request,
		@Param('cartItemId') cartItemId: string,
	): Promise<CartResponse> {
		const cart = await this.cartService.deleteItem(getBuyerCustomerId(request), cartItemId);
		return ok({ cart });
	}
}
