import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { CART_ITEM_MAX_QUANTITY } from './cart.types';

function createVariantValidationError(value: unknown): HttpError {
	return new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
		issues: [
			{
				path: 'variantId',
				message: 'variantId must be a non-empty string',
				value,
			},
		],
	});
}

function createQuantityValidationError(value: unknown): HttpError {
	return new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
		issues: [
			{
				path: 'quantity',
				message: `quantity must be an integer between 1 and ${CART_ITEM_MAX_QUANTITY}`,
				value,
			},
		],
	});
}

export function parseCartQuantity(value: unknown, defaultQuantity = 1): number {
	if (value === undefined) {
		return defaultQuantity;
	}

	const parsed = typeof value === 'string' ? Number(value.trim()) : Number(value);

	if (!Number.isInteger(parsed) || parsed < 1 || parsed > CART_ITEM_MAX_QUANTITY) {
		throw createQuantityValidationError(value);
	}

	return parsed;
}

export function parseRequiredCartQuantity(value: unknown): number {
	if (value === undefined) {
		throw createQuantityValidationError(value);
	}

	return parseCartQuantity(value);
}

export function parseCartVariantId(value: unknown): string {
	if (typeof value !== 'string') {
		throw createVariantValidationError(value);
	}

	const normalized = value.trim();
	if (normalized.length === 0) {
		throw createVariantValidationError(value);
	}

	return normalized;
}
