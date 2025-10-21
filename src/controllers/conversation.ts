import { Request, Response } from 'express'

import Conversation from '../models/conversation'

export const getConversations = async (req: Request, res: Response) => {
  try {
    const conversations = await Conversation.findByUserId(req.userId!)

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

export const getConversation = async (req: Request, res: Response) => {
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

export const createConversation = async (req: Request, res: Response) => {
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

export const deleteConversation = async (req: Request, res: Response) => {
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
