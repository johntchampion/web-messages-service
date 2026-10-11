import webpush, { WebPushError } from 'web-push'

import PushSubscription from '../models/push-subscription'

const PUSH_TIME_TO_LIVE_SECONDS = 60 * 60 * 24
const EXPIRED_SUBSCRIPTION_STATUS_CODES = [404, 410]

export interface PushPayload {
  title: string
  body: string
  convoId: string
  url: string
  tag: string
}

export const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? ''

export const pushEnabled = Boolean(
  process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
)

if (pushEnabled) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

/**
 * Sends a push message to one device. Subscriptions the push service reports
 * as gone are deleted; other failures are logged.
 */
export const sendPush = async (
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<void> => {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: PUSH_TIME_TO_LIVE_SECONDS },
    )
  } catch (error) {
    if (isExpiredSubscriptionError(error)) {
      await subscription.delete()
    } else {
      console.error('Failed to send push notification:', error)
    }
  }
}

const isExpiredSubscriptionError = (error: unknown): boolean =>
  error instanceof WebPushError &&
  EXPIRED_SUBSCRIPTION_STATUS_CODES.includes(error.statusCode)
