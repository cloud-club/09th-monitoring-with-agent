import type { Request } from 'express';

const UUID_SEGMENT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function normalizePath(path: string): string {
	return path.replace(UUID_SEGMENT_PATTERN, ':id');
}

export function getRequestEndpoint(request: Request): string {
	const route = request.route as { path?: unknown } | undefined;
	const routePath = typeof route?.path === 'string' ? route.path : request.path;
	const baseUrl = request.baseUrl;

	if (baseUrl.length === 0) {
		return normalizePath(routePath);
	}

	if (routePath === '/') {
		return normalizePath(baseUrl);
	}

	return normalizePath(`${baseUrl}${routePath}`);
}
