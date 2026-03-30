import { BadRequestException, Controller, Get, Query } from '@nestjs/common'

import type { HealthQueryDto } from './dto/health-query.dto'
import { HealthService, type HealthResponse } from './health.service'

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('/health')
  getHealth(@Query('backendApiBaseUrl') backendApiBaseUrl?: string): HealthResponse {
    if (backendApiBaseUrl) {
      this.assertValidUrl(backendApiBaseUrl)
    }

    const query: HealthQueryDto = {
      backendApiBaseUrl
    }

    return this.healthService.getHealth(query)
  }

  private assertValidUrl(input: string): void {
    try {
      const parsed = new URL(input)

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported URL protocol')
      }
    } catch (_error) {
      throw new BadRequestException('backendApiBaseUrl must be a valid http(s) URL')
    }
  }
}
