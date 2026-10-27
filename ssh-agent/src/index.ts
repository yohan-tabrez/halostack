require('dotenv').config({ path: '../.env' })
import './boot' // validates secrets before any worker side-effects
import './worker'
import { startWsServer } from './ws-server'
import { startMetricsServer } from './metrics'
import { scheduleHealthChecks } from './worker'
import { startRetentionJob } from './retention'
import { poolSize } from './lib/ssh-pool'
import { sshPoolSize } from './metrics'

startWsServer(8080)
startMetricsServer(9090)
scheduleHealthChecks().catch(console.error)
startRetentionJob().catch(console.error)

setInterval(() => {
  sshPoolSize.set(poolSize())
}, 15_000)
