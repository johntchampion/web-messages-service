import { Router } from 'express'
import { body } from 'express-validator'

import * as messageController from '../controllers/message'
import { authentication, authorization } from '../middleware/auth'

const router = Router()

router.get('/messages', messageController.getMessages)

router.post(
  '/message',
  authentication,
  body('convoId').exists().withMessage('Conversation ID is required.'),
  body('content').exists().withMessage('Message content is required.'),
  messageController.createMessage
)

export default router
