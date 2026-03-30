import { createHealthResponse, resolveMetricPath } from './app'

describe('app unit behavior', () => {
  it('creates the stable health payload', () => {
    expect(createHealthResponse()).toEqual({
      success: true,
      data: {
        status: 'ok'
      }
    })
  })

  it('prefers the normalized route path when recording metrics labels', () => {
    expect(resolveMetricPath('/health', '/health')).toBe('/health')
    expect(resolveMetricPath('/unknown')).toBe('/unknown')
  })
})
