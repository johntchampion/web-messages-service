import path from 'path'
import { createServer } from 'http'
import express, { Request, Response, NextFunction } from 'express'
import { CronJob } from 'cron'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import RequestError from './util/error'
import { setupSocketIO } from './util/io'
import authRoutes from './routes/auth'
import messageRoutes from './routes/message'
import conversationController from './controllers/conversation'
import { deleteConversations } from './util/cron'

const app = express()
const server = createServer(app)
app.use(cors())
app.use(express.json())

setupSocketIO(server)

app.get('/', (_: Request, res: Response, __: NextFunction) => {
  return res.status(200).json({
    message: 'Alive and well!',
  })
})

app.use('/auth', authRoutes)
app.use(messageRoutes)
app.use(conversationController)

app.get('/health-check', (req: Request, res: Response, next: NextFunction) => {
  return res.status(200).json({
    message: 'Alive and well.',
  })
})

app.use(
  (error: RequestError, req: Request, res: Response, next: NextFunction) => {
    return res.status(error.code || 500).json({
      message: error.message,
    })
  }
)

const job = CronJob.from({
  cronTime: '0 0 * * * *',
  onTick: deleteConversations,
  timeZone: 'America/New_York',
})

server.listen(process.env.PORT || 8000, () => {
  console.log(`Now listening on port ${process.env.PORT || 8000}`)
  job.start()
})
