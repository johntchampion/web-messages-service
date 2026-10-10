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
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)

  await query(
    `
      DELETE FROM sessions
      WHERE expires_at < ?
    `,
    [cutoff]
  )
}
