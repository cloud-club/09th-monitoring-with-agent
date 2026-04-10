import { Inject, Injectable } from '@nestjs/common';

import { CatalogService } from '../catalog/catalog.service';
import type { CatalogProductListItem } from '../catalog/catalog.types';

import type { RecommendationResult } from './recommendation.types';

function compareRecommendationProducts(left: CatalogProductListItem, right: CatalogProductListItem): number {
	const snapshotDiff = right.latest_snapshot_created_at.localeCompare(left.latest_snapshot_created_at);

	if (snapshotDiff !== 0) {
		return snapshotDiff;
	}

	return left.product_id.localeCompare(right.product_id);
}

@Injectable()
export class RecommendationService {
	public constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

	public async listRecommendations(productId: string, limit: number): Promise<RecommendationResult> {
		await this.catalogService.getProduct(productId);

		const catalog = await this.catalogService.listAllProducts('newest');

		const items = catalog
			.filter((item) => item.product_id !== productId)
			.sort(compareRecommendationProducts)
			.slice(0, limit);

		return {
			items,
		};
	}
}
