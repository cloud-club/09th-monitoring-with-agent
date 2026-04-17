import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { Injectable } from '@nestjs/common';

import { UnauthorizedCustomerError } from '../http/http-error';
import {
	createBuyerRequestContext,
	CUSTOMER_ID_HEADER,
	getHeaderValue,
	getRequestContext,
	setRequestContext,
} from './request-context';
import { isSeededCustomerId } from './seeded-customer-ids';

@Injectable()
export class BuyerAccessGuard implements CanActivate {
	public canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const customerId = getHeaderValue(request.headers[CUSTOMER_ID_HEADER]);

		if (customerId === undefined) {
			throw new UnauthorizedCustomerError('x-customer-id header is required for buyer write endpoints');
		}

		if (!isSeededCustomerId(customerId)) {
			throw new UnauthorizedCustomerError('x-customer-id must match a seeded customer identifier');
		}

		setRequestContext(request, createBuyerRequestContext(getRequestContext(request), customerId));

		return true;
	}
}
