import { BadRequestException } from '@nestjs/common'

import { HealthController } from '../src/health/health.controller'
import { HealthService } from '../src/health/health.service'

describe('HealthController integration', () => {
  it('connects controller and service behavior for health response', () => {
    const service = new HealthService()
    const controller = new HealthController(service)
    const response = controller.getHealth('http://localhost:7000/')

    expect(controller).toBeDefined()
    expect(response.data.backendApiBaseUrl).toBe('http://localhost:7000')
    expect(() => controller.getHealth('invalid-url')).toThrow(BadRequestException)
  })
})
