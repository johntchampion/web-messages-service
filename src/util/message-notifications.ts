import Conversation from '../models/conversation'
import Message from '../models/message'
import PushSubscription from '../models/push-subscription'
import { findSubscriptionIdsViewing } from './conversation-viewers'
import { PushPayload, pushEnabled, sendPush } from './push-client'

const MAX_BODY_CHARACTERS = 200
const FALLBACK_SENDER_NAME = 'Someone'

export interface NewMessageNotification {
  conversation: Conversation
  message: Message
  senderName?: string | null
  senderSubscriptionId?: string | null
}

/**
 * Pushes a new message to every subscribed device in its conversation, except
 * the sender's devices and devices currently viewing the conversation.
 * Fire-and-forget: errors are logged, never propagated.
 */
export const notifyNewMessage = async (
  notification: NewMessageNotification,
): Promise<void> => {
  if (!pushEnabled) return

  try {
    const recipients = await findRecipientsNotViewing(notification)
    const payload = buildMessagePayload(notification)
    await Promise.all(
      recipients.map((recipient) => sendPush(recipient, payload)),
    )
  } catch (error) {
    console.error('Failed to send message notifications:', error)
  }
}

const findRecipientsNotViewing = async ({
  conversation,
  message,
  senderSubscriptionId,
}: NewMessageNotification): Promise<PushSubscription[]> => {
  const recipients = await PushSubscription.findRecipientsForConversation(
    conversation.id!,
    { senderUserId: message.senderId, senderSubscriptionId },
  )
  const viewingSubscriptionIds = findSubscriptionIdsViewing(conversation.id!)
  return recipients.filter(
    (recipient) => !viewingSubscriptionIds.has(recipient.id!),
  )
}

export const buildMessagePayload = ({
  conversation,
  message,
  senderName,
}: NewMessageNotification): PushPayload => {
  const convoId = conversation.id!
  const displayedSenderName =
    senderName || message.senderName || FALLBACK_SENDER_NAME

  return {
    title: `${displayedSenderName} in ${conversation.name}`,
    body: describeMessageContent(message),
    convoId,
    url: `/${convoId}`,
    tag: convoId,
  }
}

const describeMessageContent = (message: Message): string =>
  message.type === 'image'
    ? 'Sent an image'
    : truncateCharacters(message.content, MAX_BODY_CHARACTERS)

const truncateCharacters = (text: string, maxCharacters: number): string => {
  const characters = Array.from(text)
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters - 1).join('')}…`
    : text
}
