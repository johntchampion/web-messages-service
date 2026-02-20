import query from '../util/db'

export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export interface PushSubscriptionData {
  endpoint: string
  keys: PushSubscriptionKeys
}

export default class PushSubscription {
  /**
   * Upsert a push subscription for a user.
   * If the endpoint already exists, update the keys.
   */
  static save = async (
    userId: string,
    subscription: PushSubscriptionData,
  ): Promise<void> => {
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = $1, p256dh = $3, auth = $4;`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
    )
  }

  /**
   * Delete a push subscription by its endpoint.
   */
  static deleteByEndpoint = async (endpoint: string): Promise<void> => {
    await query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1;`,
      [endpoint],
    )
  }

  /**
   * Delete all push subscriptions for a user.
   */
  static deleteByUserId = async (userId: string): Promise<void> => {
    await query(
      `DELETE FROM push_subscriptions WHERE user_id = $1;`,
      [userId],
    )
  }

  /**
   * Find all push subscriptions for a set of user IDs.
   */
  static findByUserIds = async (
    userIds: string[],
  ): Promise<{ userId: string; subscription: PushSubscriptionData }[]> => {
    if (userIds.length === 0) return []

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ')
    const result = await query(
      `SELECT user_id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id IN (${placeholders});`,
      userIds,
    )

    return result.rows.map((row) => ({
      userId: row['user_id'],
      subscription: {
        endpoint: row['endpoint'],
        keys: {
          p256dh: row['p256dh'],
          auth: row['auth'],
        },
      },
    }))
  }
}
