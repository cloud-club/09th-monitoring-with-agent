import { Module } from '@nestjs/common';

import { BuyerAccessGuard } from './buyer-access.guard';
import { RequestContextController } from './request-context.controller';

@Module({
	controllers: [RequestContextController],
	providers: [BuyerAccessGuard],
	exports: [BuyerAccessGuard],
})
export class RequestContextModule {}
