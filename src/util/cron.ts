import Conversation from '../models/conversation'
import query from './db'

/**
 * Deletes conversations that are older than 30 days.
 */
export const deleteConversations = async () => {
  await Conversation.findByAge(30, true)
}

/**
 * Permanently removes refresh token sessions that have been expired for 14 days.
 */
export const deleteExpiredRefreshTokens = async () => {
  await query(
    `
      DELETE FROM sessions
      WHERE expires_at < NOW() - INTERVAL '14 days'
    `,
    []
  )
}
