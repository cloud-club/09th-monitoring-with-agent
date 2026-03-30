import type { Response } from 'express';
import { Controller, Get, Res } from '@nestjs/common';

import { ok } from '../http/contracts';
import { getMetricsText, metricsContentType } from '../metrics/metrics-registry';

@Controller()
export class HealthController {
	@Get('/health')
	public getHealth() {
		return ok({ status: 'ok' });
	}

	@Get('/metrics')
	public async getMetrics(@Res() response: Response): Promise<void> {
		response.setHeader('Content-Type', metricsContentType);
		response.status(200).send(await getMetricsText());
	}
}
