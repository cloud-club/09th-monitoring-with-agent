import type { Request } from 'express';
import type { OrderResponse } from './order.controller.types';

import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';

import { ok } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';
import { AppLoggerService } from '../logging/app-logger.service';
import { incrementOrderCreate } from '../metrics/metrics-registry';
import { getRequestContext } from '../request-context/request-context';
import { BuyerAccessGuard } from '../request-context/buyer-access.guard';

import { parseRequiredUuidLike } from './order.query';
import { OrderService } from './order.service';

type CreateOrderBody = {
	cartId?: unknown;
	addressId?: unknown;
};

function getBuyerCustomerId(request: Request): string {
	const context = getRequestContext(request);
	if (context.actor.type !== 'buyer') {
		throw new Error('Buyer context expected after BuyerAccessGuard');
	}
	return context.actor.customerId;
}

@Controller('/api/orders')
@UseGuards(BuyerAccessGuard)
export class OrderController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(OrderService) private readonly orderService: OrderService,
	) {}

	@Post()
	public async createOrder(@Req() request: Request, @Body() body: CreateOrderBody): Promise<OrderResponse> {
		try {
			const customerId = getBuyerCustomerId(request);
			const cartId = parseRequiredUuidLike(body.cartId, 'cartId');
			const order = await this.orderService.createOrder(
				customerId,
				cartId,
				parseRequiredUuidLike(body.addressId, 'addressId'),
			);

			incrementOrderCreate('success');
			this.appLogger.logDomainEvent({
				request,
				eventName: 'order.created',
				result: 'success',
				fields: {
					order_id: order.order_id,
					cart_id: cartId,
				},
			});

			return ok({ order });
		} catch (error) {
			if (error instanceof HttpError && error.code === ERROR_CODES.STATE_CONFLICT) {
				incrementOrderCreate('conflict');
			} else {
				incrementOrderCreate('error');
			}

			throw error;
		}
	}

	@Get('/:orderId')
	public async getOrder(@Req() request: Request, @Param('orderId') orderId: string): Promise<OrderResponse> {
		const order = await this.orderService.getOrder(getBuyerCustomerId(request), orderId);
		return ok({ order });
	}
}
