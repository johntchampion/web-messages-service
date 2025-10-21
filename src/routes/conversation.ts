import { Router } from 'express'

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

router.delete(
  '/conversations/:convoId',
  conversationController.deleteConversation
)

export default router
