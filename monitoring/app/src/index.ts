import { createBackendHealthFetcher } from './backend-health'
import { createMonitoringApp } from './app'

const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL ?? 'http://localhost:8080'
const port = Number(process.env.PORT ?? '8081')

const fetchBackendHealth = createBackendHealthFetcher({
  baseUrl: backendApiBaseUrl,
  timeoutMs: 1500
})

const app = createMonitoringApp({
  fetchBackendHealth
})

app.listen(port)
