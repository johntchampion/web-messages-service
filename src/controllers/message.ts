import { Request, Response } from 'express'
import { validationResult } from 'express-validator'

import Message from '../models/message'
import Conversation from '../models/conversation'
import User from '../models/user'

export const getMessages = async (req: Request, res: Response) => {
  const convoId: string = req.query.convoId as string
  const limit: number | undefined = req.query.limit
    ? parseInt(req.query.limit as string)
    : undefined
  const skip: number | undefined = req.query.skip
    ? parseInt(req.query.skip as string)
    : undefined

  try {
    const conversation = await Conversation.findById(convoId)
    const messages = await Message.listByConversation(convoId, {
      limit,
    })

    return res.status(200).json({
      messages: messages,
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

export const createMessage = async (req: Request, res: Response) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    })
  }

  const convoId: string = req.body.convoId
  const content: string = req.body.content
  const userName: string = req.body.userName
  const userAvatar: string = req.body.userAvatar

  const user = req.userId ? await User.findById(req.userId!) : null

  try {
    const newMessage = new Message({
      convoId: convoId,
      content: content,
      type: 'text',
      senderId: user ? user.id : null,
      senderName: user ? null : userName,
      senderAvatar: user ? null : userAvatar,
    })
    await newMessage.create()

    return res.status(200).json({
      message: newMessage,
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
