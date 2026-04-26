import type { SearchProductsQuery, SearchProductsResult } from './search.types';

import { Inject, Injectable } from '@nestjs/common';

import { ProductReadModelRepository } from '../product-read-model/product-read-model.repository';

@Injectable()
export class SearchService {
	public constructor(@Inject(ProductReadModelRepository) private readonly productReadModel: ProductReadModelRepository) {}

	public async searchProducts(query: SearchProductsQuery): Promise<SearchProductsResult> {
		return this.productReadModel.searchProducts(query);
	}
}
