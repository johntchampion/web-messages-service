import http from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

import Message from '../models/message'
import Conversation from '../models/conversation'
import User from '../models/user'
import { AccessToken } from '../models/user'
import { getUploadURL } from './upload'

/**
 * The object used to emit information to sockets.
 */
let io: Server

/**
 * Result of socket event authentication
 */
type AuthResult =
  | { success: true; userId: string; verified: boolean; user: User }
  | { success: false; error: string }
  | null // null means no token was provided

/**
 * Authenticates a socket event by verifying the provided JWT token.
 * @param token JWT token to verify
 * @returns Authentication result with explicit error messages for invalid/expired tokens
 */
const authenticateSocketEvent = async (token?: string): Promise<AuthResult> => {
  if (!token) return null

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.TOKEN_SECRET as string
    ) as AccessToken

    // Validate tokenVersion against the user's current tokenVersion
    const user = await User.findById(decodedToken.userId)
    if (!user) {
      return { success: false, error: 'User not found.' }
    }

    if (user.tokenVersion !== decodedToken.tokenVersion) {
      return {
        success: false,
        error: 'Token has been invalidated. Please log in again.',
      }
    }

    return {
      success: true,
      userId: decodedToken.userId,
      verified: decodedToken.verified,
      user,
    }
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { success: false, error: 'Token has expired.' }
    } else if (error instanceof jwt.JsonWebTokenError) {
      return { success: false, error: 'Invalid token.' }
    } else if (error instanceof jwt.NotBeforeError) {
      return { success: false, error: 'Token not yet valid.' }
    } else {
      return { success: false, error: 'Authentication failed.' }
    }
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
    socket.on('list-messages', async (params = {}, callback) => {
      const { convoId, limit, before, after, order, token } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      try {
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        const conversation = await Conversation.findById(convoId)
        const result = await Message.listByConversation(convoId, {
          limit: limit ? parseInt(limit) : undefined,
          before,
          after,
          order,
        })

        if (auth && auth.success) {
          Conversation.recordVisit(auth.userId, convoId).catch(() => {})
        }

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

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Create/send a new message.
     * REST equivalent: POST /message
     * Params: { convoId, content, userName?, userAvatar?, token? }
     */
    socket.on('create-message', async (params = {}, callback) => {
      const { convoId, content, userName, userAvatar, token } = params

      if (!convoId || !content) {
        callback?.({
          success: false,
          error: 'Conversation ID and content are required.',
        })
        return
      }

      try {
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        // Use the user object from auth result (no need to query again)
        const user = auth && auth.success ? auth.user : null

        const newMessage = new Message({
          convoId,
          content,
          type: 'text',
          senderId: user ? user.id : null,
          senderName: user ? null : userName,
          senderAvatar: user ? null : userAvatar,
        })
        await newMessage.create()

        // Update sender details if user is authenticated. Only for the response data, not for saving to the DB
        newMessage.senderName = user ? user.displayName : newMessage.senderName
        newMessage.senderAvatar = user
          ? getUploadURL(user.profilePicURL)
          : newMessage.senderAvatar

        callback?.({
          success: true,
          data: { message: newMessage },
        })

        broadcastMessage(convoId, newMessage)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error sending the message.'
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    // ==================== CONVERSATION EVENTS ====================

    /**
     * List all conversations for authenticated user.
     * REST equivalent: GET /conversations
     * Params: { token, owned? }
     */
    socket.on('list-conversations', async (params = {}, callback) => {
      const { token, owned } = params

      const auth = await authenticateSocketEvent(token)

      // No token provided
      if (!auth) {
        callback?.({
          success: false,
          error: 'Authentication required.',
        })
        return
      }

      // Token provided but invalid/expired
      if (!auth.success) {
        callback?.({
          success: false,
          error: auth.error,
        })
        return
      }

      try {
        const conversations = await Conversation.findForUser(auth.userId, owned === true)

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Get a single conversation by ID.
     * REST equivalent: GET /conversations/:convoId
     * Params: { convoId, token? }
     */
    socket.on('get-conversation', async (params = {}, callback) => {
      const { convoId, token } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      try {
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        const conversation = await Conversation.findById(convoId)

        if (auth && auth.success) {
          Conversation.recordVisit(auth.userId, convoId).catch(() => {})
        }

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Create a new conversation.
     * REST equivalent: POST /conversations
     * Params: { name, token? }
     */
    socket.on('create-conversation', async (params = {}, callback) => {
      const { name, token } = params

      if (!name) {
        callback?.({
          success: false,
          error: 'A conversation name is required.',
        })
        return
      }

      try {
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        const newConversation = new Conversation({
          name,
          creatorId: auth && auth.success ? auth.userId : null,
        })
        await newConversation.update()

        if (auth && auth.success && newConversation.id) {
          Conversation.recordVisit(auth.userId, newConversation.id).catch(() => {})
        }

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Update a conversation's name.
     * REST equivalent: PUT /conversations/:convoId
     * Params: { convoId, name, token? }
     */
    socket.on('update-conversation', async (params = {}, callback) => {
      const { convoId, name, token } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      if (!name || name.length < 1) {
        callback?.({
          success: false,
          error: 'A conversation name is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        // If conversation has a creator, only that creator can update it
        if (
          conversation.creatorId !== null &&
          conversation.creatorId !== (auth && auth.success ? auth.userId : null)
        ) {
          callback?.({
            success: false,
            error: 'Only the creator can update this conversation.',
          })
          return
        }

        conversation.name = name
        await conversation.update()

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Delete a conversation.
     * REST equivalent: DELETE /conversations/:convoId
     * Params: { convoId, token? }
     */
    socket.on('delete-conversation', async (params = {}, callback) => {
      const { convoId, token } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      try {
        const conversation = await Conversation.findById(convoId)
        const auth = await authenticateSocketEvent(token)

        // If a token was provided but is invalid, return explicit error
        if (auth !== null && !auth.success) {
          callback?.({
            success: false,
            error: auth.error,
          })
          return
        }

        // If conversation has a creator, only that creator can delete it
        if (
          conversation.creatorId !== null &&
          conversation.creatorId !== (auth && auth.success ? auth.userId : null)
        ) {
          callback?.({
            success: false,
            error: 'Only the creator can delete this conversation.',
          })
          return
        }

        await conversation.delete()

        callback?.({
          success: true,
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
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    /**
     * Remove a conversation from the user's visited list.
     * REST equivalent: DELETE /conversations/:convoId/visit
     * Params: { convoId, token }
     */
    socket.on('remove-conversation-visit', async (params = {}, callback) => {
      const { convoId, token } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      const auth = await authenticateSocketEvent(token)

      // No token provided
      if (!auth) {
        callback?.({
          success: false,
          error: 'Authentication required.',
        })
        return
      }

      // Token provided but invalid/expired
      if (!auth.success) {
        callback?.({
          success: false,
          error: auth.error,
        })
        return
      }

      try {
        const removed = await Conversation.removeVisit(auth.userId, convoId)

        callback?.({
          success: true,
          data: { removed },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'There was an error removing the conversation visit.'
        callback?.({
          success: false,
          error: message,
        })
      }
    })

    // ==================== ROOM MANAGEMENT ====================

    /**
     * Join a conversation room to receive real-time updates.
     * Params: { convoId }
     */
    socket.on('join-conversation', async (params = {}, callback) => {
      const { convoId } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      try {
        await socket.join(convoId)
        callback?.({
          success: true,
          data: { convoId, joined: true },
        })
      } catch (error) {
        callback?.({
          success: false,
          error: 'There was an error joining the conversation.',
        })
      }
    })

    /**
     * Leave a conversation room to stop receiving real-time updates.
     * Params: { convoId }
     */
    socket.on('leave-conversation', async (params = {}, callback) => {
      const { convoId } = params

      if (!convoId) {
        callback?.({
          success: false,
          error: 'Conversation ID is required.',
        })
        return
      }

      try {
        await socket.leave(convoId)
        callback?.({
          success: true,
          data: { convoId, left: true },
        })
      } catch (error) {
        callback?.({
          success: false,
          error: 'There was an error leaving the conversation.',
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

/**
 * Broadcasts a user profile update to all conversation rooms the user participates in.
 * @param convoIds The conversation rooms to broadcast to.
 * @param payload Minimal user payload for clients to update cached data.
 */
export const broadcastUserProfileUpdate = (
  convoIds: string[],
  payload: { userId: string; displayName?: string; profilePicURL?: string | null }
) => {
  convoIds.forEach((convoId) => {
    io?.to(convoId).emit('user-updated', {
      ...payload,
      convoId,
    })
  })
}
