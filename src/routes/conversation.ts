import { Router } from 'express'
import { body } from 'express-validator'

import * as conversationController from '../controllers/conversation'
import { authentication, authorization } from '../middleware/auth'

const router = Router()

router.get(
  '/conversations',
  authentication,
  authorization, // Authorization is required; getConversations function needs req.userId
  conversationController.getConversations
)

router.get('/conversations/:convoId', conversationController.getConversation)

router.post(
  '/conversations',
  authentication,
  conversationController.createConversation
)

router.put(
  '/conversations/:convoId',
  authentication,
  authorization,
  body('name').isLength({ min: 1 }).withMessage('A conversation name is required.'),
  conversationController.updateConversation
)

router.delete(
  '/conversations/:convoId',
  conversationController.deleteConversation
)

export default router
