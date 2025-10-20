import { Router, Request, Response, NextFunction } from 'express'

import { authentication } from '../middleware/auth'
import Conversation from '../models/conversation'

const router = Router()

router.get(
  '/conversations',
  async (req: Request, res: Response, next: NextFunction) => {
    const userId: string = req.query.userId as string

    if (!userId) {
      return res.status(400).json({
        errorMessage: 'userId query parameter is required.',
      })
    }

    try {
      const conversations = await Conversation.findByUserId(userId)

      return res.status(200).json({
        conversations: conversations.map((convo) => ({
          ...convo,
          deletionDate: convo.getDeletionDate(),
        })),
      })
    } catch (error) {
      return res.status(500).json({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'A server error has occured. Please try again later.',
      })
    }
  }
)

router.get(
  '/conversation/:convoId',
  async (req: Request, res: Response, next: NextFunction) => {
    const convoId: string = req.params.convoId

    try {
      const conversation = await Conversation.findById(convoId)

      return res.status(200).json({
        conversation: conversation,
        deletionDate: conversation.getDeletionDate(),
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'A server error has occured. Please try again later.'
      const code =
        message === 'There is no conversation with that ID.' ? 410 : 500
      return res.status(code).json({
        errorMessage: message,
      })
    }
  }
)

router.post(
  '/conversation',
  authentication,
  async (req: Request, res: Response, next: NextFunction) => {
    const name: string = req.body.name

    try {
      const newConversation = new Conversation({
        name: name,
        creatorId: req.userId,
      })
      await newConversation.update()

      return res.status(200).json({
        conversation: newConversation,
        deletionDate: newConversation.getDeletionDate(),
      })
    } catch (error) {
      return res.status(500).json({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'A server error has occured. Please try again later.',
      })
    }
  }
)

router.delete(
  '/conversation/:convoId',
  async (req: Request, res: Response, next: NextFunction) => {
    const convoId: string = req.params.convoId

    try {
      const conversation = await Conversation.findById(convoId)
      await conversation.delete()

      return res.sendStatus(200)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'A server error has occured. Please try again later.'
      const code =
        message === 'There is no conversation with that ID.' ? 410 : 500
      return res.status(code).json({
        errorMessage: message,
      })
    }
  }
)

export default router
