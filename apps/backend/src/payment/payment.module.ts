import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { IssueModule } from '../issue/issue.module';

import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
	imports: [DatabaseModule, IssueModule],
	controllers: [PaymentController],
	providers: [PaymentService],
})
export class PaymentModule {}
