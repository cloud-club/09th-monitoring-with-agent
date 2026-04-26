import type { CatalogListQuery, CatalogListResult, CatalogProductDetail, CatalogProductListItem, CatalogSort } from './catalog.types';

import { Inject, Injectable } from '@nestjs/common';

import { ProductReadModelRepository } from '../product-read-model/product-read-model.repository';

@Injectable()
export class CatalogService {
	public constructor(@Inject(ProductReadModelRepository) private readonly productReadModel: ProductReadModelRepository) {}

	public async listProducts(query: CatalogListQuery): Promise<CatalogListResult> {
		return this.productReadModel.listProducts(query);
	}

	public async getProduct(productId: string): Promise<CatalogProductDetail> {
		return this.productReadModel.getProduct(productId);
	}

	public async listAllProducts(sort: CatalogSort): Promise<CatalogProductListItem[]> {
		return this.productReadModel.listAllProducts(sort);
	}
}
