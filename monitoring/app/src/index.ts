import { createMonitoringApp } from './app'

const port = Number(process.env.PORT ?? '8081')

const app = createMonitoringApp()

app.listen(port)
