import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { CustomerLockService } from './customer-lock.service';
import { DemoAddressPolicy } from './demo-address-policy';

@Module({
	imports: [DatabaseModule],
	providers: [CustomerLockService, DemoAddressPolicy],
	exports: [CustomerLockService, DemoAddressPolicy],
})
export class ApplicationModule {}
