import Conversation from '../../models/conversation'
import Message from '../../models/message'
import PushSubscription from '../../models/push-subscription'
import * as pushClient from '../../util/push-client'
import { startViewing, stopViewing } from '../../util/conversation-viewers'
import {
  buildMessagePayload,
  notifyNewMessage,
} from '../../util/message-notifications'

jest.mock('../../models/push-subscription')
jest.mock('../../util/push-client', () => ({
  pushEnabled: true,
  sendPush: jest.fn(),
}))

const mockFindRecipients =
  PushSubscription.findRecipientsForConversation as jest.MockedFunction<
    typeof PushSubscription.findRecipientsForConversation
  >
const mockSendPush = pushClient.sendPush as jest.MockedFunction<
  typeof pushClient.sendPush
>

const convoId = '770e8400-e29b-41d4-a716-446655440002'
const conversation = { id: convoId, name: 'Weekend Plans' } as Conversation

const textMessage = (content: string, overrides: Partial<Message> = {}) =>
  ({
    convoId,
    type: 'text',
    content,
    senderId: null,
    senderName: 'Guest',
    ...overrides,
  }) as Message

const subscription = (id: string) => ({ id }) as PushSubscription

describe('buildMessagePayload', () => {
  it('titles the notification with the sender and conversation', () => {
    expect(
      buildMessagePayload({
        conversation,
        message: textMessage('Hello!'),
        senderName: 'Alex',
      }),
    ).toEqual({
      title: 'Alex in Weekend Plans',
      body: 'Hello!',
      convoId,
      url: `/${convoId}`,
      tag: convoId,
    })
  })

  it("falls back to the message's sender name, then a placeholder", () => {
    expect(
      buildMessagePayload({ conversation, message: textMessage('Hi') }).title,
    ).toBe('Guest in Weekend Plans')
    expect(
      buildMessagePayload({
        conversation,
        message: textMessage('Hi', { senderName: null }),
      }).title,
    ).toBe('Someone in Weekend Plans')
  })

  it('truncates long messages without splitting characters', () => {
    const body = buildMessagePayload({
      conversation,
      message: textMessage('😀'.repeat(300)),
    }).body

    expect(Array.from(body)).toHaveLength(200)
    expect(body.endsWith('😀…')).toBe(true)
  })

  it('describes image messages instead of sending their URL', () => {
    expect(
      buildMessagePayload({
        conversation,
        message: textMessage('https://example.com/a.png', { type: 'image' }),
      }).body,
    ).toBe('Sent an image')
  })
})

describe('notifyNewMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('pushes to each recipient, excluding the sender', async () => {
    mockFindRecipients.mockResolvedValue([subscription('a'), subscription('b')])
    const message = textMessage('Hello', { senderId: 'sender-user' })

    await notifyNewMessage({
      conversation,
      message,
      senderSubscriptionId: 'sender-device',
    })

    expect(mockFindRecipients).toHaveBeenCalledWith(convoId, {
      senderUserId: 'sender-user',
      senderSubscriptionId: 'sender-device',
    })
    expect(mockSendPush).toHaveBeenCalledTimes(2)
    expect(mockSendPush).toHaveBeenCalledWith(
      subscription('a'),
      expect.objectContaining({ body: 'Hello', convoId }),
    )
  })

  it('skips devices currently viewing the conversation', async () => {
    mockFindRecipients.mockResolvedValue([subscription('a'), subscription('b')])
    startViewing('socket-1', convoId, 'a')
    startViewing('socket-2', 'another-conversation', 'b')

    await notifyNewMessage({ conversation, message: textMessage('Hello') })

    expect(mockSendPush).toHaveBeenCalledTimes(1)
    expect(mockSendPush).toHaveBeenCalledWith(
      subscription('b'),
      expect.anything(),
    )
    stopViewing('socket-1')
    stopViewing('socket-2')
  })

  it('logs failures instead of throwing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    mockFindRecipients.mockRejectedValue(new Error('database is locked'))

    await expect(
      notifyNewMessage({ conversation, message: textMessage('Hello') }),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
