import express, { type Request, type Response } from 'express'

export function renderHomePage(): string {

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
      <p>Runtime mode: standalone</p>
    </main>
  </body>
</html>`
}

export function createMonitoringApp() {
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

  app.get('/', (_request: Request, response: Response) => {
    response.status(200).type('html').send(renderHomePage())
  })

  return app
}
