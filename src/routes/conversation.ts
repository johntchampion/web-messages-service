import { Router } from 'express'

import * as conversationController from '../controllers/conversation'
import { authentication } from '../middleware/auth'

const router = Router()

router.get('/conversations', conversationController.getConversations)

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
