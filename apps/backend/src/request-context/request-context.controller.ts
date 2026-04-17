import type { Request } from 'express';

import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { ok } from '../http/contracts';
import { BuyerAccessGuard } from './buyer-access.guard';
import { getRequestTelemetryContext } from './request-context';

@Controller('/api')
export class RequestContextController {
	@Get('/catalog/context-check')
	public getPublicCatalogContract(@Req() request: Request) {
		return ok({
			access: 'public-read',
			context: getRequestTelemetryContext(request),
		});
	}

	@Post('/cart/context-check')
	@UseGuards(BuyerAccessGuard)
	public postCartItemContract(@Req() request: Request) {
		return ok({
			accepted: true,
			context: getRequestTelemetryContext(request),
		});
	}
}
