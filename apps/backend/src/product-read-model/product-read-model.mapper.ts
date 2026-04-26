import type {
	CatalogPriceSummary,
	CatalogProductDetail,
	CatalogProductListItem,
	CatalogSort,
	CatalogStockSummary,
	CatalogVariantSummary,
} from '../catalog/catalog.types';
import type { ProductReadRow, ProductSearchRow } from './product-read-model.types';

function toIsoString(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPriceNumber(value: string): number {
	return Number(value);
}

function toPriceString(value: number): string {
	return value.toFixed(2);
}

function getLowestNumber(values: readonly number[]): number {
	return values.reduce((lowest, current) => (current < lowest ? current : lowest));
}

function getHighestNumber(values: readonly number[]): number {
	return values.reduce((highest, current) => (current > highest ? current : highest));
}

function createPriceSummary(variants: readonly CatalogVariantSummary[]): CatalogPriceSummary | null {
	if (variants.length === 0) {
		return null;
	}

	const nominalPrices = variants.map(variant => toPriceNumber(variant.nominal_price));
	const currentPrices = variants.map(variant => toPriceNumber(variant.current_price));

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
		is_available: variants.some(variant => variant.is_available),
	};
}

function groupRows<TRow extends ProductReadRow>(rows: readonly TRow[]): TRow[][] {
	const groupedRows = new Map<string, TRow[]>();

	for (const row of rows) {
		const existingRows = groupedRows.get(row.sale_id);

		if (existingRows === undefined) {
			groupedRows.set(row.sale_id, [row]);
			continue;
		}

		groupedRows.set(row.sale_id, [...existingRows, row]);
	}

	return [...groupedRows.values()];
}

function mapProductRowGroup(productRows: readonly ProductReadRow[]): CatalogProductDetail {
	const [firstRow] = productRows;
	if (firstRow === undefined) {
		throw new Error('Product row group cannot be empty');
	}

	const sortedRows = [...productRows].sort((left, right) => {
		const unitDiff = left.unit_sequence - right.unit_sequence;

		if (unitDiff !== 0) {
			return unitDiff;
		}

		return left.stock_sequence - right.stock_sequence;
	});

	const variantSummaries = sortedRows.map(row => ({
		variant_id: row.stock_id,
		unit_name: row.unit_name,
		variant_name: row.stock_name,
		nominal_price: toPriceString(toPriceNumber(row.nominal_price)),
		current_price: toPriceString(toPriceNumber(row.real_price)),
		available_quantity: row.quantity,
		is_available: row.quantity > 0,
	}));

	const priceSummary = createPriceSummary(variantSummaries);
	if (priceSummary === null) {
		throw new Error(`Catalog product ${firstRow.sale_id} has no variants`);
	}

	return {
		product_id: firstRow.sale_id,
		snapshot_id: firstRow.snapshot_id,
		title: firstRow.title,
		price_summary: priceSummary,
		stock_summary: createStockSummary(variantSummaries),
		variant_summaries: variantSummaries,
		latest_snapshot_created_at: toIsoString(firstRow.snapshot_created_at),
		snapshot_content: {
			format: firstRow.format,
			body: firstRow.body,
			revert_policy: firstRow.revert_policy,
		},
	};
}

export type RankedCatalogProductDetail = CatalogProductDetail & {
	readonly prefix_rank: number;
};

export function mapProductRows(rows: readonly ProductReadRow[]): CatalogProductDetail[] {
	return groupRows(rows).map(mapProductRowGroup);
}

export function mapSearchProductRows(rows: readonly ProductSearchRow[]): RankedCatalogProductDetail[] {
	return groupRows(rows).map(productRows => ({
		...mapProductRowGroup(productRows),
		prefix_rank: productRows[0]?.prefix_rank ?? 1,
	}));
}

export function toCatalogListItem(product: CatalogProductDetail): CatalogProductListItem {
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

function compareCatalogProducts(left: CatalogProductListItem, right: CatalogProductListItem, sort: CatalogSort): number {
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

export function sortCatalogProducts(products: readonly CatalogProductListItem[], sort: CatalogSort): CatalogProductListItem[] {
	return [...products].sort((left, right) => compareCatalogProducts(left, right, sort));
}

export function compareSearchProducts(left: RankedCatalogProductDetail, right: RankedCatalogProductDetail): number {
	if (left.prefix_rank !== right.prefix_rank) {
		return left.prefix_rank - right.prefix_rank;
	}

	const titleDiff = left.title.localeCompare(right.title);
	if (titleDiff !== 0) {
		return titleDiff;
	}

	return left.product_id.localeCompare(right.product_id);
}
