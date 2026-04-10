import type { Request } from 'express';

export const CUSTOMER_ID_HEADER = 'x-customer-id';
export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestUserRole = 'anonymous' | 'buyer';

export type AnonymousActor = {
	readonly type: 'anonymous';
};

export type BuyerActor = {
	readonly type: 'buyer';
	readonly customerId: string;
};

export type RequestActor = AnonymousActor | BuyerActor;

export type RequestContext = {
	readonly requestId: string;
	readonly actor: RequestActor;
};

export type RequestTelemetryContext = {
	readonly requestId: string;
	readonly userRole: RequestUserRole;
	readonly customerId?: string;
};

const requestContextStore = new WeakMap<Request, RequestContext>();

export function createAnonymousRequestContext(requestId: string): RequestContext {
	return {
		requestId,
		actor: {
			type: 'anonymous',
		},
	};
}

export function createBuyerRequestContext(
	requestContext: RequestContext,
	customerId: string,
): RequestContext {
	return {
		...requestContext,
		actor: {
			type: 'buyer',
			customerId,
		},
	};
}

export function setRequestContext(request: Request, requestContext: RequestContext): void {
	requestContextStore.set(request, requestContext);
}

export function getRequestContext(request: Request): RequestContext {
	const requestContext = requestContextStore.get(request);

	if (requestContext === undefined) {
		throw new Error('Request context is not available on this request');
	}

	return requestContext;
}

export function getRequestTelemetryContext(request: Request): RequestTelemetryContext {
	const requestContext = getRequestContext(request);

	if (requestContext.actor.type === 'buyer') {
		return {
			requestId: requestContext.requestId,
			userRole: 'buyer',
			customerId: requestContext.actor.customerId,
		};
	}

	return {
		requestId: requestContext.requestId,
		userRole: 'anonymous',
	};
}

export function getHeaderValue(value: string | string[] | undefined): string | undefined {
	if (typeof value === 'string') {
		const trimmedValue = value.trim();

		return trimmedValue.length > 0 ? trimmedValue : undefined;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const trimmedValue = item.trim();

			if (trimmedValue.length > 0) {
				return trimmedValue;
			}
		}
	}

	return undefined;
}
