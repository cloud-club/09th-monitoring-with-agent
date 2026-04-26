import { Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module';

import { PaymentController } from './payment.controller';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';

@Module({
	imports: [ApplicationModule],
	controllers: [PaymentController],
	providers: [PaymentRepository, PaymentService],
})
export class PaymentModule {}
