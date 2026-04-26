import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../http/http-error';

@Injectable()
export class DemoAddressPolicy {
	private readonly seededAddressByCustomer: Record<string, string> = {
		'11111111-1111-4111-8111-111111111111': '22222222-2222-4222-8222-222222222221',
		'11111111-1111-4111-8111-111111111112': '22222222-2222-4222-8222-222222222222',
	};

	public assertCustomerOwnsAddress(customerId: string, addressId: string): void {
		const allowedAddressId = this.seededAddressByCustomer[customerId];
		if (allowedAddressId === undefined || allowedAddressId !== addressId) {
			throw new NotFoundError('Address not found');
		}
	}
}
