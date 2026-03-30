import express, { type Request, type Response } from 'express'
import { Counter, Registry, collectDefaultMetrics } from 'prom-client'

export const app = express()

const metricsRegistry = new Registry()

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
      path: typeof routePath === 'string' ? routePath : request.path,
      status: String(response.statusCode)
    })
  })

  next()
})

app.get('/health', (_request: Request, response: Response) => {
  response.status(200).json({
    success: true,
    data: {
      status: 'ok'
    }
  })
})

app.get('/metrics', async (_request: Request, response: Response) => {
  response.set('Content-Type', metricsRegistry.contentType)
  response.status(200).send(await metricsRegistry.metrics())
})
