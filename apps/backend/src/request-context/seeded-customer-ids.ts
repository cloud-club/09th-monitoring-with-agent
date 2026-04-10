export const SEEDED_CUSTOMER_IDS: readonly string[] = [
	'11111111-1111-4111-8111-111111111111',
	'11111111-1111-4111-8111-111111111112',
];

export function isSeededCustomerId(customerId: string): boolean {
	return SEEDED_CUSTOMER_IDS.includes(customerId);
}
