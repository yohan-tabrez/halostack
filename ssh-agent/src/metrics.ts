import express from 'express'
import client from 'prom-client'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

// Create a Registry
const register = new client.Registry()
client.collectDefaultMetrics({ register })

// Define custom metrics
export const jobsTotal = new client.Counter({
  name: 'halostack_ssh_jobs_total',
  help: 'Total number of SSH jobs processed',
  labelNames: ['status']
})

export const ptySessionsActive = new client.Gauge({
  name: 'halostack_pty_sessions_active',
  help: 'Number of active interactive PTY sessions'
})

register.registerMetric(jobsTotal)
export const sshPoolSize = new client.Gauge({
  name: 'halostack_ssh_pool_size',
  help: 'Number of pooled SSH connections',
})

register.registerMetric(sshPoolSize)

export function startMetricsServer(port: number = 9090) {
  const app = express()
  
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType)
      res.end(await register.metrics())
    } catch (ex) {
      res.status(500).end(ex)
    }
  })

  app.listen(port, () => {
    logger.info({ port }, 'Prometheus metrics server running on port ' + port)
  })
}
