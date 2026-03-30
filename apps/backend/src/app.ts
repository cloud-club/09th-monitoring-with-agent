import express, { type Request, type Response } from 'express'
import { Counter, Registry, collectDefaultMetrics } from 'prom-client'

export interface HealthResponse {
  readonly success: true
  readonly data: {
    readonly status: 'ok'
  }
}

export const app = express()

const metricsRegistry = new Registry()

export const createHealthResponse = (): HealthResponse => ({
  success: true,
  data: {
    status: 'ok'
  }
})

export const resolveMetricPath = (requestPath: string, routePath?: string): string => {
  return typeof routePath === 'string' ? routePath : requestPath
}

collectDefaultMetrics({ register: metricsRegistry })

const httpRequestsTotal = new Counter({
  name: 'mwa_http_requests_total',
  help: 'Total HTTP requests handled by backend',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [metricsRegistry]
})

app.use(express.json())

app.use((request, response, next) => {
  response.on('finish', () => {
    const routePath = request.route?.path

    httpRequestsTotal.inc({
      method: request.method,
      path: resolveMetricPath(request.path, typeof routePath === 'string' ? routePath : undefined),
      status: String(response.statusCode)
    })
  })

  next()
})

app.get('/health', (_request: Request, response: Response) => {
  response.status(200).json(createHealthResponse())
})

app.get('/metrics', async (_request: Request, response: Response) => {
  response.set('Content-Type', metricsRegistry.contentType)
  response.status(200).send(await metricsRegistry.metrics())
})
