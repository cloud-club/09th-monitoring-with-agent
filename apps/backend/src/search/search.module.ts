import { Module } from '@nestjs/common';

import { ProductReadModelModule } from '../product-read-model/product-read-model.module';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
	imports: [ProductReadModelModule],
	controllers: [SearchController],
	providers: [SearchService],
})
export class SearchModule {}
