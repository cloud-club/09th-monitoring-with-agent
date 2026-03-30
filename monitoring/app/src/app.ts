import express, { type Request, type Response } from 'express'

import { type BackendHealthSnapshot } from './backend-health'

interface MonitoringAppDependencies {
  readonly fetchBackendHealth: () => Promise<BackendHealthSnapshot>
}

interface RenderHomePageParams {
  readonly backendHealth: BackendHealthSnapshot
}

export function renderHomePage(params: RenderHomePageParams): string {
  const { backendHealth } = params

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Monitoring App</title>
  </head>
  <body>
    <main>
      <h1>Monitoring App (SSR baseline)</h1>
      <p>Backend API source: ${backendHealth.source}</p>
      <p>Backend API health: ${backendHealth.status}</p>
    </main>
  </body>
</html>`
}

export function createMonitoringApp(dependencies: MonitoringAppDependencies) {
  const app = express()

  app.use(express.json())

  app.get('/health', (_request: Request, response: Response) => {
    response.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'monitoring-app'
      }
    })
  })

  app.get('/', async (_request: Request, response: Response) => {
    const backendHealth = await dependencies.fetchBackendHealth()

    response.status(200).type('html').send(renderHomePage({ backendHealth }))
  })

  return app
}
