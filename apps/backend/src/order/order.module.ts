import { Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module';

import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
	imports: [ApplicationModule],
	controllers: [OrderController],
	providers: [OrderRepository, OrderService],
})
export class OrderModule {}
