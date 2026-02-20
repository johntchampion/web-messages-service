import { Router, Request, Response } from 'express'

import { authentication, authorization } from '../middleware/auth'
import PushSubscription from '../models/pushSubscription'
import RequestError from '../util/error'

const router = Router()

const subscribe = async (req: Request, res: Response) => {
  const { endpoint, keys } = req.body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw RequestError.withMessageAndCode('Invalid push subscription data.', 400)
  }

  await PushSubscription.save(req.userId!, { endpoint, keys })

  return res.status(200).json({ message: 'Push subscription saved.' })
}

const unsubscribe = async (req: Request, res: Response) => {
  const { endpoint } = req.body

  if (!endpoint) {
    throw RequestError.withMessageAndCode('Endpoint is required.', 400)
  }

  await PushSubscription.deleteByEndpoint(endpoint)

  return res.status(200).json({ message: 'Push subscription removed.' })
}

router.post('/subscribe', authentication, authorization, subscribe)
router.post('/unsubscribe', authentication, authorization, unsubscribe)

export default router
