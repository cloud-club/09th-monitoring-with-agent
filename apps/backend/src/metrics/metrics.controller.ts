import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

import { getMetricsText, metricsContentType } from './metrics-registry';

@Controller()
export class MetricsController {
	@Get('/metrics')
	public async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
		response.setHeader('Content-Type', metricsContentType);
		return getMetricsText();
	}
}
