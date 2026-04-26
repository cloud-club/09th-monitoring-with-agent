import type { CatalogProductListItem } from '../catalog/catalog.types';

import type { RecommendationResult } from './recommendation.types';
import { Inject, Injectable } from '@nestjs/common';

import { ProductReadModelRepository } from '../product-read-model/product-read-model.repository';

function compareRecommendationProducts(left: CatalogProductListItem, right: CatalogProductListItem): number {
	const snapshotDiff = right.latest_snapshot_created_at.localeCompare(left.latest_snapshot_created_at);

	if (snapshotDiff !== 0) {
		return snapshotDiff;
	}

	return left.product_id.localeCompare(right.product_id);
}

@Injectable()
export class RecommendationService {
	public constructor(@Inject(ProductReadModelRepository) private readonly productReadModel: ProductReadModelRepository) {}

	public async listRecommendations(productId: string, limit: number): Promise<RecommendationResult> {
		await this.productReadModel.getProduct(productId);

		const catalog = await this.productReadModel.listAllProducts('newest');

		const items = catalog
			.filter(item => item.product_id !== productId)
			.sort(compareRecommendationProducts)
			.slice(0, limit);

		return {
			items,
		};
	}
}
