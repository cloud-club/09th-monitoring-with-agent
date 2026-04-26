import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CustomerLockService {
	public constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

	public async runWithCustomerLock<T>(customerId: string, operation: (entityManager: EntityManager) => Promise<T>): Promise<T> {
		return this.entityManager.transactional(async (entityManager) => {
			await entityManager.getConnection().execute(
				'SELECT pg_advisory_xact_lock(hashtext(?))',
				[customerId],
				'get',
			);

			return operation(entityManager);
		});
	}
}
