import query from '../util/db'

/**
 * A user's choice to stop push notifications for a conversation they visited.
 */
export default class ConversationMute {
  static async mute(userId: string, convoId: string): Promise<void> {
    await query(
      `
        INSERT INTO conversation_notification_mutes (user_id, convo_id)
        VALUES (?, ?)
        ON CONFLICT (user_id, convo_id) DO NOTHING;
      `,
      [userId, convoId],
    )
  }

  static async unmute(userId: string, convoId: string): Promise<void> {
    await query(
      'DELETE FROM conversation_notification_mutes WHERE user_id = ? AND convo_id = ?;',
      [userId, convoId],
    )
  }
}
