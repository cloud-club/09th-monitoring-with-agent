import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { ProductReadModelRepository } from './product-read-model.repository';

@Module({
	imports: [DatabaseModule],
	providers: [ProductReadModelRepository],
	exports: [ProductReadModelRepository],
})
export class ProductReadModelModule {}
