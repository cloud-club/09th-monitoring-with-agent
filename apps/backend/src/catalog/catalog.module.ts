import { Module } from '@nestjs/common';

import { ProductReadModelModule } from '../product-read-model/product-read-model.module';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
	imports: [ProductReadModelModule],
	controllers: [CatalogController],
	providers: [CatalogService],
	exports: [CatalogService],
})
export class CatalogModule {}
