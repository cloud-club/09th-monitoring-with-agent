import { Injectable } from '@nestjs/common'

import type { HealthQueryDto } from './dto/health-query.dto'

export interface HealthResponse {
  readonly success: true
  readonly data: {
    readonly status: 'ok'
    readonly stack: readonly ['nest', 'mikro', 'jest', 'typia']
    readonly backendApiBaseUrl: string
  }
}

@Injectable()
export class HealthService {
  getHealth(query: HealthQueryDto): HealthResponse {
    const backendApiBaseUrl = this.normalizeBackendApiBaseUrl(query.backendApiBaseUrl)

    return {
      success: true,
      data: {
        status: 'ok',
        stack: ['nest', 'mikro', 'jest', 'typia'],
        backendApiBaseUrl
      }
    }
  }

  private normalizeBackendApiBaseUrl(baseUrl: HealthQueryDto['backendApiBaseUrl']): string {
    if (!baseUrl) {
      return 'http://localhost:8080'
    }

    const normalized = new URL(baseUrl)
    return normalized.toString().replace(/\/$/, '')
  }
}
