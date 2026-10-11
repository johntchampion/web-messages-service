import { Router } from 'express'
import { body, query, ValidationChain } from 'express-validator'

import * as pushController from '../controllers/push'
import { authentication } from '../middleware/auth'
import requirePushEnabled from '../middleware/push-enabled'

const router = Router()

const asPushEndpoint = (field: ValidationChain) =>
  field
    .isURL({ protocols: ['https'], require_tld: false })
    .withMessage('A push subscription endpoint is required.')
    .isLength({ max: 2048 })
    .withMessage('The push subscription endpoint is too long.')

const endpointInBody = asPushEndpoint(body('endpoint'))

router.use(requirePushEnabled)

router.get('/public-key', pushController.getPublicKey)

router.post(
  '/subscriptions',
  authentication,
  asPushEndpoint(body('subscription.endpoint')),
  asPushEndpoint(body('previousEndpoint').optional({ values: 'null' })),
  body('subscription.keys.p256dh')
    .isString()
    .isLength({ min: 1, max: 256 })
    .withMessage('The push subscription p256dh key is required.'),
  body('subscription.keys.auth')
    .isString()
    .isLength({ min: 1, max: 256 })
    .withMessage('The push subscription auth key is required.'),
  pushController.saveSubscription
)

router.delete('/subscriptions', endpointInBody, pushController.deleteSubscription)

router.get(
  '/conversations/:convoId',
  asPushEndpoint(query('endpoint')),
  pushController.getConversationNotificationStatus
)

router.put(
  '/conversations/:convoId',
  authentication,
  endpointInBody,
  pushController.enableConversationNotifications
)

router.delete(
  '/conversations/:convoId',
  authentication,
  endpointInBody,
  pushController.disableConversationNotifications
)

export default router
