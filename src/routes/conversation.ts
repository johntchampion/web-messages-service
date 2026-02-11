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

router.get(
  '/conversations/:convoId',
  authentication,
  conversationController.getConversation
)

router.post(
  '/conversations',
  authentication,
  conversationController.createConversation
)

router.put(
  '/conversations/:convoId',
  authentication, // Only authentication, not authorization - allows anonymous updates
  body('name').isLength({ min: 1 }).withMessage('A conversation name is required.'),
  conversationController.updateConversation
)

router.delete(
  '/conversations/:convoId',
  authentication, // Only authentication, not authorization - allows anonymous deletion of unowned conversations
  conversationController.deleteConversation
)

router.delete(
  '/conversations/:convoId/visit',
  authentication,
  authorization,
  conversationController.removeConversationVisit
)

export default router
