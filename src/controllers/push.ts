import { Request, Response } from 'express'
import { validationResult } from 'express-validator'

import Conversation from '../models/conversation'
import ConversationMute from '../models/conversation-mute'
import PushSubscription from '../models/push-subscription'
import RequestError from '../util/error'
import { vapidPublicKey } from '../util/push-client'

export const getPublicKey = (req: Request, res: Response) => {
  return res.status(200).json({ publicKey: vapidPublicKey })
}

/**
 * Saves this device's subscription, linking it to the requesting user when
 * logged in and unlinking it otherwise. When the browser rotated the
 * subscription, `previousEndpoint` carries the device's follows over.
 */
export const saveSubscription = async (req: Request, res: Response) => {
  rejectInvalidRequest(req)

  const incoming = new PushSubscription({
    userId: req.userId ?? null,
    endpoint: req.body.subscription.endpoint,
    p256dh: req.body.subscription.keys.p256dh,
    auth: req.body.subscription.keys.auth,
    userAgent: req.get('User-Agent') ?? null,
  })
  const subscription = await saveRotatedOrNewSubscription(
    incoming,
    req.body.previousEndpoint,
  )

  return res.status(200).json({ subscriptionId: subscription.id })
}

export const deleteSubscription = async (req: Request, res: Response) => {
  rejectInvalidRequest(req)

  const removed = await PushSubscription.deleteByEndpoint(req.body.endpoint)
  return res.status(200).json({ removed })
}

export const getConversationNotificationStatus = async (
  req: Request,
  res: Response,
) => {
  rejectInvalidRequest(req)

  const subscription = await findSubscriptionOrThrow(
    req.query.endpoint as string,
  )
  const enabled = await subscription.isNotifiedAbout(req.params.convoId)
  return res.status(200).json({ enabled })
}

export const enableConversationNotifications = async (
  req: Request,
  res: Response,
) => {
  rejectInvalidRequest(req)

  const convoId = req.params.convoId
  await findConversationOrThrow(convoId)
  const subscription = await findSubscriptionOrThrow(req.body.endpoint)

  await subscription.follow(convoId)
  if (req.userId) await ConversationMute.unmute(req.userId, convoId)

  return res.status(200).json({ enabled: true })
}

export const disableConversationNotifications = async (
  req: Request,
  res: Response,
) => {
  rejectInvalidRequest(req)

  const convoId = req.params.convoId
  await findConversationOrThrow(convoId)
  const subscription = await findSubscriptionOrThrow(req.body.endpoint)

  await subscription.unfollow(convoId)
  if (req.userId) await ConversationMute.mute(req.userId, convoId)

  return res.status(200).json({ enabled: false })
}

const saveRotatedOrNewSubscription = async (
  incoming: PushSubscription,
  previousEndpoint?: string,
): Promise<PushSubscription> => {
  const isRotation = previousEndpoint && previousEndpoint !== incoming.endpoint
  if (!isRotation) return incoming.upsert()

  const [previous, alreadySaved] = await Promise.all([
    PushSubscription.findByEndpoint(previousEndpoint),
    PushSubscription.findByEndpoint(incoming.endpoint),
  ])
  if (!previous || alreadySaved) return incoming.upsert()

  return previous.replaceEndpoint(incoming)
}

const rejectInvalidRequest = (req: Request) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw RequestError.withMessageAndCode(errors.array()[0].msg, 400)
  }
}

const findSubscriptionOrThrow = async (
  endpoint: string,
): Promise<PushSubscription> => {
  const subscription = await PushSubscription.findByEndpoint(endpoint)
  if (!subscription) {
    throw RequestError.withMessageAndCode(
      'This device is not subscribed to push notifications.',
      404,
    )
  }
  return subscription
}

const findConversationOrThrow = async (convoId: string) => {
  try {
    return await Conversation.findById(convoId)
  } catch {
    throw RequestError.withMessageAndCode(
      'There is no conversation with that ID.',
      410,
    )
  }
}
