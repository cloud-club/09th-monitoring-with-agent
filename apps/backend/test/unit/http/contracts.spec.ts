import { fail, ok } from '../../../src/http/contracts';

describe('http contracts', () => {
	it('returns a success envelope without meta when only data is provided', () => {
		expect(ok({ status: 'ok' })).toEqual({
			success: true,
			data: {
				status: 'ok',
			},
		});
	});

	it('returns an error envelope with details when provided', () => {
		expect(fail('VALIDATION_ERROR', 'Request validation failed', { field: 'page' })).toEqual({
			success: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Request validation failed',
				details: { field: 'page' },
			},
		});
	});
});
