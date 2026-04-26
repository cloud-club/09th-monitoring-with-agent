import { Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module';

import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
	imports: [ApplicationModule],
	controllers: [CartController],
	providers: [CartRepository, CartService],
})
export class CartModule {}
