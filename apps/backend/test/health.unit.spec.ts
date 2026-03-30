import { HealthService } from '../src/health/health.service'

describe('HealthService', () => {
  const service = new HealthService()

  it('returns stack signature and default backend url', () => {
    const result = service.getHealth({})

    expect(result.success).toBe(true)
    expect(result.data.status).toBe('ok')
    expect(result.data.stack).toEqual(['nest', 'mikro', 'jest', 'typia'])
    expect(result.data.backendApiBaseUrl).toBe('http://localhost:8080')
  })

  it('normalizes backendApiBaseUrl when valid url is provided', () => {
    const result = service.getHealth({
      backendApiBaseUrl: 'http://localhost:9000/'
    })

    expect(result.data.backendApiBaseUrl).toBe('http://localhost:9000')
  })
})
