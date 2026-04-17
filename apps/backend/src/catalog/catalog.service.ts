import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../http/http-error';

import { PrismaService } from '../database/prisma.service';
import type {
	CatalogListQuery,
	CatalogListResult,
	CatalogPriceSummary,
	CatalogProductDetail,
	CatalogProductListItem,
	CatalogSort,
	CatalogStockSummary,
	CatalogVariantSummary,
} from './catalog.types';

const ACTIVE_SALE_FILTER = {
	openedAt: { not: null },
	closedAt: null,
	pausedAt: null,
	suspendedAt: null,
};

async function loadCatalogSales(prisma: PrismaService) {
	return prisma.sale.findMany({
		where: ACTIVE_SALE_FILTER,
		include: {
			snapshots: {
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				take: 1,
				include: {
					contents: {
						orderBy: { id: 'asc' },
					},
					units: {
						orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
						include: {
							stocks: {
								orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
							},
						},
					},
				},
			},
		},
	});
}

type CatalogSaleRecord = Awaited<ReturnType<typeof loadCatalogSales>>[number];
type CatalogSnapshotRecord = CatalogSaleRecord['snapshots'][number];
type CatalogSnapshotUnitRecord = CatalogSnapshotRecord['units'][number];
type CatalogVariantRecord = CatalogSnapshotUnitRecord['stocks'][number];

function getLowestNumber(values: readonly number[]): number {
	return values.reduce((lowest, current) => (current < lowest ? current : lowest));
}

function getHighestNumber(values: readonly number[]): number {
	return values.reduce((highest, current) => (current > highest ? current : highest));
}

function toPriceNumber(value: string): number {
	return Number(value);
}

function toPriceString(value: number): string {
	return value.toFixed(2);
}

function createVariantSummaries(sale: CatalogSaleRecord): CatalogVariantSummary[] {
	const snapshot = sale.snapshots[0];
	if (snapshot === undefined) {
		return [];
	}

	return snapshot.units.flatMap((unit: CatalogSnapshotUnitRecord) =>
		unit.stocks.map((stock: CatalogVariantRecord) => ({
			variant_id: stock.id,
			unit_name: unit.name,
			variant_name: stock.name,
			nominal_price: toPriceString(toPriceNumber(stock.nominalPrice.toString())),
			current_price: toPriceString(toPriceNumber(stock.realPrice.toString())),
			available_quantity: stock.quantity,
			is_available: stock.quantity > 0,
		})),
	);
}

function createPriceSummary(variants: readonly CatalogVariantSummary[]): CatalogPriceSummary | null {
	if (variants.length === 0) {
		return null;
	}

	const nominalPrices = variants.map((variant) => toPriceNumber(variant.nominal_price));
	const currentPrices = variants.map((variant) => toPriceNumber(variant.current_price));

	return {
		lowest_nominal_price: toPriceString(getLowestNumber(nominalPrices)),
		highest_nominal_price: toPriceString(getHighestNumber(nominalPrices)),
		lowest_current_price: toPriceString(getLowestNumber(currentPrices)),
		highest_current_price: toPriceString(getHighestNumber(currentPrices)),
	};
}

function createStockSummary(variants: readonly CatalogVariantSummary[]): CatalogStockSummary {
	const totalQuantity = variants.reduce((sum, variant) => sum + variant.available_quantity, 0);

	return {
		total_quantity: totalQuantity,
		is_available: variants.some((variant) => variant.is_available),
	};
}

function mapSaleToCatalogProduct(sale: CatalogSaleRecord): CatalogProductDetail | null {
	const snapshot = sale.snapshots[0];
	const content = snapshot?.contents[0];
	if (snapshot === undefined || content === undefined) {
		return null;
	}

	const variantSummaries = createVariantSummaries(sale);
	const priceSummary = createPriceSummary(variantSummaries);
	if (priceSummary === null) {
		return null;
	}

	return {
		product_id: sale.id,
		snapshot_id: snapshot.id,
		title: content.title,
		price_summary: priceSummary,
		stock_summary: createStockSummary(variantSummaries),
		variant_summaries: variantSummaries,
		latest_snapshot_created_at: snapshot.createdAt.toISOString(),
		snapshot_content: {
			format: content.format,
			body: content.body,
			revert_policy: content.revertPolicy,
		},
	};
}

function toCatalogListItem(product: CatalogProductDetail): CatalogProductListItem {
	return {
		product_id: product.product_id,
		snapshot_id: product.snapshot_id,
		title: product.title,
		price_summary: product.price_summary,
		stock_summary: product.stock_summary,
		variant_summaries: product.variant_summaries,
		latest_snapshot_created_at: product.latest_snapshot_created_at,
	};
}

function compareCatalogProducts(
	left: CatalogProductListItem,
	right: CatalogProductListItem,
	sort: CatalogSort,
): number {
	if (sort === 'price_asc') {
		const priceDiff = Number(left.price_summary.lowest_current_price) - Number(right.price_summary.lowest_current_price);
		if (priceDiff !== 0) {
			return priceDiff;
		}
	}

	if (sort === 'price_desc') {
		const priceDiff = Number(right.price_summary.lowest_current_price) - Number(left.price_summary.lowest_current_price);
		if (priceDiff !== 0) {
			return priceDiff;
		}
	}

	return right.latest_snapshot_created_at.localeCompare(left.latest_snapshot_created_at);
}

@Injectable()
export class CatalogService {
	public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

	public async listProducts(query: CatalogListQuery): Promise<CatalogListResult> {
		const sales = await loadCatalogSales(this.prisma);
		const products = sales
			.map(mapSaleToCatalogProduct)
			.filter((product: CatalogProductDetail | null): product is CatalogProductDetail => product !== null)
			.sort((left: CatalogProductDetail, right: CatalogProductDetail) =>
				compareCatalogProducts(left, right, query.sort),
			);

		const offset = (query.page - 1) * query.limit;

		return {
			items: products.slice(offset, offset + query.limit).map(toCatalogListItem),
			total: products.length,
		};
	}

	public async getProduct(productId: string): Promise<CatalogProductDetail> {
		const sales = await this.prisma.sale.findMany({
			where: {
				id: productId,
				...ACTIVE_SALE_FILTER,
			},
			include: {
				snapshots: {
					orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
					take: 1,
					include: {
						contents: {
							orderBy: { id: 'asc' },
						},
						units: {
							orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
							include: {
								stocks: {
									orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
								},
							},
						},
					},
				},
			},
		});

		const product = sales
			.map(mapSaleToCatalogProduct)
			.find((value: CatalogProductDetail | null): value is CatalogProductDetail => value !== null);
		if (product === undefined) {
			throw new NotFoundError('Catalog product not found');
		}

		return product;
	}
}
