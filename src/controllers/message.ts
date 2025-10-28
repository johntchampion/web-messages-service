import { Request, Response } from 'express'
import { validationResult } from 'express-validator'

import Message from '../models/message'
import Conversation from '../models/conversation'
import User from '../models/user'
import { getUploadURL } from '../util/upload'

export const getMessages = async (req: Request, res: Response) => {
  const convoId: string = req.query.convoId as string
  const limit: number | undefined = req.query.limit
    ? parseInt(req.query.limit as string)
    : undefined

  try {
    const conversation = await Conversation.findById(convoId)
    const result = await Message.listByConversation(convoId, {
      limit,
    })

    // Extract unique sender IDs from messages
    const senderIds = Array.from(
      new Set(
        result.messages
          .filter((msg) => msg.senderId)
          .map((msg) => msg.senderId!)
      )
    )

    // Fetch user details for all sender IDs
    const userMap = new Map<
      string,
      { displayName: string; profilePicURL: string | null }
    >()
    if (senderIds.length > 0) {
      const users = await Promise.all(senderIds.map((id) => User.findById(id)))
      users.forEach((user) => {
        if (user && user.id) {
          userMap.set(user.id, {
            displayName: user.displayName || '',
            profilePicURL: getUploadURL(user.profilePicURL),
          })
        }
      })
    }

    // Enrich messages with sender details
    const enrichedMessages = result.messages.map((msg) => {
      const messageData: any = {
        id: msg.id,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        convoId: msg.convoId,
        senderId: msg.senderId,
        type: msg.type,
        content: msg.content,
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
      }

      // Add user details if this message has a senderId
      if (msg.senderId && userMap.has(msg.senderId)) {
        const userData = userMap.get(msg.senderId)!
        messageData.senderName = userData.displayName
        messageData.senderAvatar = userData.profilePicURL
      }

      return messageData
    })

    return res.status(200).json({
      messages: enrichedMessages,
      pageInfo: result.pageInfo,
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
      message: {
        ...newMessage,
        senderName: user ? user.displayName : newMessage.senderName,
        senderAvatar: user
          ? getUploadURL(user.profilePicURL)
          : newMessage.senderAvatar,
      },
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
