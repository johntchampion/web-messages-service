import webpush from 'web-push'

import PushSubscription, {
  PushSubscriptionData,
} from '../models/pushSubscription'
import query from './db'

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

/**
 * Send a single push notification. Cleans up expired subscriptions (410 Gone).
 */
const sendPushNotification = async (
  subscription: PushSubscriptionData,
  payload: string,
): Promise<void> => {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      payload,
    )
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired or invalid — remove it
      await PushSubscription.deleteByEndpoint(subscription.endpoint)
    }
  }
}

/**
 * Notify all participants of a conversation about a new message,
 * except the sender.
 */
export const notifyConversationParticipants = async (
  convoId: string,
  senderUserId: string,
  messageContent: string,
  convoName: string,
  senderName: string,
): Promise<void> => {
  // Get all user IDs who have visited this conversation
  const visitResult = await query(
    `SELECT user_id FROM conversation_visits WHERE convo_id = $1;`,
    [convoId],
  )

  const userIds: string[] = visitResult.rows
    .map((row) => row['user_id'] as string)
    .filter((id) => id !== senderUserId)

  if (userIds.length === 0) return

  // Fetch push subscriptions for those users
  const subscriptions = await PushSubscription.findByUserIds(userIds)

  if (subscriptions.length === 0) return

  const payload = JSON.stringify({
    title: `${senderName} in ${convoName}`,
    body: messageContent,
    convoId,
    url: `/${convoId}`,
  })

  // Send all push notifications in parallel
  await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub.subscription, payload)),
  )
}
