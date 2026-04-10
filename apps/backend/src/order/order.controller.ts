import type { Request } from 'express';
import type { OrderResponse } from './order.controller.types';

import { Body, Controller, Get, Inject, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';

import { ok } from '../http/contracts';
import { getRequestContext, getRequestTelemetryContext } from '../request-context/request-context';
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
	private readonly logger = new Logger(OrderController.name);

	public constructor(@Inject(OrderService) private readonly orderService: OrderService) {}

	@Post()
	public async createOrder(@Req() request: Request, @Body() body: CreateOrderBody): Promise<OrderResponse> {
		const customerId = getBuyerCustomerId(request);
		const order = await this.orderService.createOrder(
			customerId,
			parseRequiredUuidLike(body.cartId, 'cartId'),
			parseRequiredUuidLike(body.addressId, 'addressId'),
		);

		const telemetry = getRequestTelemetryContext(request);
		this.logger.log(JSON.stringify({
			event_name: 'order.created',
			result: 'created',
			request_id: telemetry.requestId,
			user_role: telemetry.userRole,
			endpoint: '/api/orders',
			error_code: null,
			order_id: order.order_id,
			cart_id: parseRequiredUuidLike(body.cartId, 'cartId'),
		}));

		return ok({ order });
	}

	@Get('/:orderId')
	public async getOrder(@Req() request: Request, @Param('orderId') orderId: string): Promise<OrderResponse> {
		const order = await this.orderService.getOrder(getBuyerCustomerId(request), orderId);
		return ok({ order });
	}
}
