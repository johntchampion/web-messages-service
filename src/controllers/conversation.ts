import { Request, Response } from 'express'

import Conversation from '../models/conversation'

export const getConversations = async (req: Request, res: Response) => {
  try {
    const owned = req.query.owned === 'true'
    const conversations = await Conversation.findForUser(req.userId!, owned)

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

    if (req.userId) {
      Conversation.recordVisit(req.userId, convoId).catch(() => {})
    }

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

    if (req.userId && newConversation.id) {
      Conversation.recordVisit(req.userId, newConversation.id).catch(() => {})
    }

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

export const updateConversation = async (req: Request, res: Response) => {
  const convoId: string = req.params.convoId
  const name: string = req.body.name

  try {
    const conversation = await Conversation.findById(convoId)

    // If conversation has a creator, only that creator can update it
    // If conversation has no creator (creatorId is null), anyone can update it
    if (conversation.creatorId !== null && conversation.creatorId !== req.userId) {
      return res.status(403).json({
        errorMessage: 'Only the creator can update this conversation.',
      })
    }

    conversation.name = name
    await conversation.update()

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

export const deleteConversation = async (req: Request, res: Response) => {
  const convoId: string = req.params.convoId

  try {
    const conversation = await Conversation.findById(convoId)

    // If conversation has a creator, only that creator can delete it
    // If conversation has no creator (creatorId is null), anyone can delete it
    if (conversation.creatorId !== null && conversation.creatorId !== req.userId) {
      return res.status(403).json({
        errorMessage: 'Only the creator can delete this conversation.',
      })
    }

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

export const removeConversationVisit = async (req: Request, res: Response) => {
  const convoId: string = req.params.convoId

  try {
    const removed = await Conversation.removeVisit(req.userId!, convoId)

    if (!removed) {
      return res.status(404).json({
        errorMessage: 'No visit record found for this conversation.',
      })
    }

    return res.status(200).json({ removed: true })
  } catch (error) {
    return res.status(500).json({
      errorMessage:
        error instanceof Error
          ? error.message
          : 'A server error has occured. Please try again later.',
    })
  }
}
