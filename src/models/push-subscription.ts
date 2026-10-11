import { randomUUID } from 'crypto'
import query from '../util/db'
import { parseTimestamp } from '../util/column-parsers'

export interface PushSubscriptionProps {
  id?: string
  userId?: string | null
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
  createdAt?: Date
  updatedAt?: Date
}

/** SQL condition on `ps` (push_subscriptions) for the conversation bound to ?1. */
const RECEIVES_CONVERSATION_NOTIFICATIONS = `
  (
    EXISTS (
      SELECT 1 FROM push_subscription_follows f
      WHERE f.subscription_id = ps.subscription_id AND f.convo_id = ?1
    )
    OR EXISTS (
      SELECT 1 FROM conversation_visits v
      WHERE v.user_id = ps.user_id AND v.convo_id = ?1
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM conversation_notification_mutes m
    WHERE m.user_id = ps.user_id AND m.convo_id = ?1
  )
`

export interface RecipientExclusions {
  senderUserId?: string | null
  senderSubscriptionId?: string | null
}

export default class PushSubscription implements PushSubscriptionProps {
  id?: string
  userId?: string | null
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
  createdAt?: Date
  updatedAt?: Date

  constructor(props: PushSubscriptionProps) {
    this.id = props.id
    this.userId = props.userId ?? null
    this.endpoint = props.endpoint
    this.p256dh = props.p256dh
    this.auth = props.auth
    this.userAgent = props.userAgent ?? null
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  /**
   * Saves this subscription, keyed by its endpoint. Re-saving an endpoint
   * refreshes its keys and replaces the linked user.
   */
  async upsert(): Promise<PushSubscription> {
    const result = await query(
      `
        INSERT INTO push_subscriptions
          (subscription_id, user_id, endpoint, p256dh, auth, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (endpoint) DO UPDATE
          SET user_id = excluded.user_id,
              p256dh = excluded.p256dh,
              auth = excluded.auth,
              user_agent = excluded.user_agent,
              updated_at = ?
        RETURNING *;
      `,
      [
        randomUUID(),
        this.userId,
        this.endpoint,
        this.p256dh,
        this.auth,
        this.userAgent,
        new Date(),
      ],
    )
    Object.assign(this, PushSubscription.parseRow(result.rows[0]))
    return this
  }

  /**
   * Moves this device to a new endpoint and keys, keeping its id and follows.
   * Used when the browser rotates a subscription.
   */
  async replaceEndpoint(replacement: PushSubscription): Promise<PushSubscription> {
    const result = await query(
      `
        UPDATE push_subscriptions
           SET endpoint = ?, p256dh = ?, auth = ?, user_id = ?, user_agent = ?, updated_at = ?
         WHERE subscription_id = ?
        RETURNING *;
      `,
      [
        replacement.endpoint,
        replacement.p256dh,
        replacement.auth,
        replacement.userId,
        replacement.userAgent,
        new Date(),
        this.id,
      ],
    )
    Object.assign(this, PushSubscription.parseRow(result.rows[0]))
    return this
  }

  async delete(): Promise<void> {
    if (!this.id) return
    await query('DELETE FROM push_subscriptions WHERE subscription_id = ?;', [
      this.id,
    ])
  }

  async follow(convoId: string): Promise<void> {
    await query(
      `
        INSERT INTO push_subscription_follows (subscription_id, convo_id)
        VALUES (?, ?)
        ON CONFLICT (subscription_id, convo_id) DO NOTHING;
      `,
      [this.id, convoId],
    )
  }

  async unfollow(convoId: string): Promise<void> {
    await query(
      'DELETE FROM push_subscription_follows WHERE subscription_id = ? AND convo_id = ?;',
      [this.id, convoId],
    )
  }

  /**
   * Whether this device is notified about a conversation, either because it
   * follows it or because its user visited it and hasn't muted it.
   */
  async isNotifiedAbout(convoId: string): Promise<boolean> {
    const result = await query(
      `
        SELECT 1 FROM push_subscriptions ps
        WHERE ps.subscription_id = ?2 AND ${RECEIVES_CONVERSATION_NOTIFICATIONS}
        LIMIT 1;
      `,
      [convoId, this.id],
    )
    return result.rowCount > 0
  }

  static async findByEndpoint(
    endpoint: string,
  ): Promise<PushSubscription | null> {
    const result = await query(
      'SELECT * FROM push_subscriptions WHERE endpoint = ?;',
      [endpoint],
    )
    return result.rowCount ? PushSubscription.parseRow(result.rows[0]) : null
  }

  static async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM push_subscriptions WHERE endpoint = ?;',
      [endpoint],
    )
    return result.rowCount > 0
  }

  /**
   * Stops every device linked to a user from following a conversation.
   */
  static async unfollowForUser(userId: string, convoId: string): Promise<void> {
    await query(
      `
        DELETE FROM push_subscription_follows
        WHERE convo_id = ?
          AND subscription_id IN (
            SELECT subscription_id FROM push_subscriptions WHERE user_id = ?
          );
      `,
      [convoId, userId],
    )
  }

  /**
   * Finds every device that should be notified about a new message in a
   * conversation, leaving out the devices of whoever sent it.
   */
  static async findRecipientsForConversation(
    convoId: string,
    exclusions: RecipientExclusions = {},
  ): Promise<PushSubscription[]> {
    const result = await query(
      `
        SELECT ps.* FROM push_subscriptions ps
        WHERE ${RECEIVES_CONVERSATION_NOTIFICATIONS}
          AND (?2 IS NULL OR ps.user_id IS NULL OR ps.user_id <> ?2)
          AND (?3 IS NULL OR ps.subscription_id <> ?3);
      `,
      [
        convoId,
        exclusions.senderUserId ?? null,
        exclusions.senderSubscriptionId ?? null,
      ],
    )
    return result.rows.map(PushSubscription.parseRow)
  }

  static parseRow(row: any): PushSubscription {
    return new PushSubscription({
      id: row['subscription_id'],
      userId: row['user_id'],
      endpoint: row['endpoint'],
      p256dh: row['p256dh'],
      auth: row['auth'],
      userAgent: row['user_agent'],
      createdAt: parseTimestamp(row['created_at']),
      updatedAt: parseTimestamp(row['updated_at']),
    })
  }
}
