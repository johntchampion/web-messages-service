import http from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

import Message, { ContentType } from '../models/message'
import Conversation from '../models/conversation'
import User from '../models/user'
import { AccessToken } from '../models/user'
import { getUploadURL } from './upload'

/**
 * The object used to emit information to sockets.
 */
let io: Server

/**
 * Authenticates a socket event by verifying the provided JWT token.
 * @param token JWT token to verify
 * @returns Object containing userId and verified status, or null if invalid
 */
const authenticateSocketEvent = (
  token?: string
): { userId: string; verified: boolean } | null => {
  if (!token) return null

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.TOKEN_SECRET as string
    ) as AccessToken
    return {
      userId: decodedToken.userId,
      verified: decodedToken.verified,
    }
  } catch (error) {
    return null
  }
}

/**
 * This function must be run as early as possible, or socket-based updates will not work.
 * @param server The Node http server which this socket.io Server instance will be attached.
 */
export const setupSocketIO = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: 'GET',
      preflightContinue: false,
      optionsSuccessStatus: 204,
    },
  })

  io.on('connection', (socket: Socket) => {
    // ==================== MESSAGE EVENTS ====================

    /**
     * List messages in a conversation with cursor-based pagination.
     * REST equivalent: GET /messages
     * Params: { convoId, limit?, before?, after?, order?, token? }
     */
    socket.on('list-messages', async (params = {}) => {
      const { convoId, limit, before, after, order, token } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'list-messages',
          message: 'Conversation ID is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)
        const result = await Message.listByConversation(convoId, {
          limit: limit ? parseInt(limit) : undefined,
          before,
          after,
          order,
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
          const users = await Promise.all(
            senderIds.map((id) => User.findById(id))
          )
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

        socket.emit('response', {
          event: 'list-messages',
          data: {
            messages: enrichedMessages,
            pageInfo: result.pageInfo,
            conversation,
            deletionDate: conversation.getDeletionDate(),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error getting the messages.'
        socket.emit('error', {
          event: 'list-messages',
          message,
        })
      }
    })

    /**
     * Create/send a new message.
     * REST equivalent: POST /message
     * Params: { convoId, content, userName?, userAvatar?, token? }
     */
    socket.on('create-message', async (params = {}) => {
      const { convoId, content, userName, userAvatar, token } = params

      if (!convoId || !content) {
        socket.emit('error', {
          event: 'create-message',
          message: 'Conversation ID and content are required.',
        })
        return
      }

      try {
        const auth = authenticateSocketEvent(token)
        const user = auth ? await User.findById(auth.userId) : null

        const newMessage = new Message({
          convoId,
          content,
          type: 'text',
          senderId: user ? user.id : null,
          senderName: user ? null : userName,
          senderAvatar: user ? null : userAvatar,
        })
        await newMessage.create()

        const messageResponse = {
          ...newMessage,
          senderName: user ? user.displayName : newMessage.senderName,
          senderAvatar: user
            ? getUploadURL(user.profilePicURL)
            : newMessage.senderAvatar,
        }

        socket.emit('response', {
          event: 'create-message',
          data: { message: messageResponse },
        })

        // Broadcast to all clients in the conversation room
        socket.to(convoId).emit('message-created', {
          convoId,
          message: messageResponse,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error sending the message.'
        socket.emit('error', {
          event: 'create-message',
          message,
        })
      }
    })

    // ==================== CONVERSATION EVENTS ====================

    /**
     * List all conversations for authenticated user.
     * REST equivalent: GET /conversations
     * Params: { token }
     */
    socket.on('list-conversations', async (params = {}) => {
      const { token } = params

      const auth = authenticateSocketEvent(token)
      if (!auth) {
        socket.emit('error', {
          event: 'list-conversations',
          message: 'Authentication required.',
        })
        return
      }

      try {
        const conversations = await Conversation.findByUserId(auth.userId)

        socket.emit('response', {
          event: 'list-conversations',
          data: {
            conversations: conversations.map((convo) => ({
              ...convo,
              deletionDate: convo.getDeletionDate(),
            })),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error getting the conversations.'
        socket.emit('error', {
          event: 'list-conversations',
          message,
        })
      }
    })

    /**
     * Get a single conversation by ID.
     * REST equivalent: GET /conversations/:convoId
     * Params: { convoId }
     */
    socket.on('get-conversation', async (params = {}) => {
      const { convoId } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'get-conversation',
          message: 'Conversation ID is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)

        socket.emit('response', {
          event: 'get-conversation',
          data: {
            conversation,
            deletionDate: conversation.getDeletionDate(),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error getting the conversation.'
        socket.emit('error', {
          event: 'get-conversation',
          message,
        })
      }
    })

    /**
     * Create a new conversation.
     * REST equivalent: POST /conversations
     * Params: { name, token? }
     */
    socket.on('create-conversation', async (params = {}) => {
      const { name, token } = params

      if (!name) {
        socket.emit('error', {
          event: 'create-conversation',
          message: 'A conversation name is required.',
        })
        return
      }

      try {
        const auth = authenticateSocketEvent(token)

        const newConversation = new Conversation({
          name,
          creatorId: auth ? auth.userId : null,
        })
        await newConversation.update()

        socket.emit('response', {
          event: 'create-conversation',
          data: {
            conversation: newConversation,
            deletionDate: newConversation.getDeletionDate(),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error creating the conversation.'
        socket.emit('error', {
          event: 'create-conversation',
          message,
        })
      }
    })

    /**
     * Update a conversation's name.
     * REST equivalent: PUT /conversations/:convoId
     * Params: { convoId, name, token? }
     */
    socket.on('update-conversation', async (params = {}) => {
      const { convoId, name, token } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'update-conversation',
          message: 'Conversation ID is required.',
        })
        return
      }

      if (!name || name.length < 1) {
        socket.emit('error', {
          event: 'update-conversation',
          message: 'A conversation name is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)
        const auth = authenticateSocketEvent(token)

        // If conversation has a creator, only that creator can update it
        if (
          conversation.creatorId !== null &&
          conversation.creatorId !== auth?.userId
        ) {
          socket.emit('error', {
            event: 'update-conversation',
            message: 'Only the creator can update this conversation.',
          })
          return
        }

        conversation.name = name
        await conversation.update()

        socket.emit('response', {
          event: 'update-conversation',
          data: {
            conversation,
            deletionDate: conversation.getDeletionDate(),
          },
        })

        // Broadcast update to all clients in the conversation room
        socket.to(convoId).emit('conversation-updated', {
          conversation,
          deletionDate: conversation.getDeletionDate(),
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error updating the conversation.'
        socket.emit('error', {
          event: 'update-conversation',
          message,
        })
      }
    })

    /**
     * Delete a conversation.
     * REST equivalent: DELETE /conversations/:convoId
     * Params: { convoId }
     */
    socket.on('delete-conversation', async (params = {}) => {
      const { convoId } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'delete-conversation',
          message: 'Conversation ID is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)
        await conversation.delete()

        socket.emit('response', {
          event: 'delete-conversation',
          data: { success: true },
        })

        // Broadcast deletion to all clients in the conversation room
        socket.to(convoId).emit('conversation-deleted', {
          convoId,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error deleting the conversation.'
        socket.emit('error', {
          event: 'delete-conversation',
          message,
        })
      }
    })

    // ==================== ROOM MANAGEMENT ====================

    /**
     * Join a conversation room to receive real-time updates.
     * Params: { convoId }
     */
    socket.on('join-conversation', async (params = {}) => {
      const { convoId } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'join-conversation',
          message: 'Conversation ID is required.',
        })
        return
      }

      try {
        await socket.join(convoId)
        socket.emit('response', {
          event: 'join-conversation',
          data: { convoId, joined: true },
        })
      } catch (error) {
        socket.emit('error', {
          event: 'join-conversation',
          message: 'There was an error joining the conversation.',
        })
      }
    })

    /**
     * Leave a conversation room to stop receiving real-time updates.
     * Params: { convoId }
     */
    socket.on('leave-conversation', async (params = {}) => {
      const { convoId } = params

      if (!convoId) {
        socket.emit('error', {
          event: 'leave-conversation',
          message: 'Conversation ID is required.',
        })
        return
      }

      try {
        await socket.leave(convoId)
        socket.emit('response', {
          event: 'leave-conversation',
          data: { convoId, left: true },
        })
      } catch (error) {
        socket.emit('error', {
          event: 'leave-conversation',
          message: 'There was an error leaving the conversation.',
        })
      }
    })
  })
}

/**
 * Broadcasts a message to all participants in a conversation room.
 * @param convoId The conversation room to broadcast to.
 * @param message The message to broadcast.
 */
export const broadcastMessage = (convoId: string, message: Message) => {
  io?.to(convoId).emit('message-created', {
    convoId,
    message,
  })
}

/**
 * Broadcasts a conversation update to all participants in a conversation room.
 * @param convoId The conversation room to broadcast to.
 * @param conversation The updated conversation.
 */
export const broadcastConversationUpdate = (
  convoId: string,
  conversation: Conversation
) => {
  io?.to(convoId).emit('conversation-updated', {
    conversation,
    deletionDate: conversation.getDeletionDate(),
  })
}

/**
 * Broadcasts a conversation deletion to all participants in a conversation room.
 * @param convoId The conversation room to broadcast to.
 */
export const broadcastConversationDeletion = (convoId: string) => {
  io?.to(convoId).emit('conversation-deleted', {
    convoId,
  })
}
