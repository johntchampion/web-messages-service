import webpush, { WebPushError } from 'web-push'

import PushSubscription from '../../models/push-subscription'
import { PushPayload, sendPush } from '../../util/push-client'

jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push')
  return {
    __esModule: true,
    default: { sendNotification: jest.fn(), setVapidDetails: jest.fn() },
    WebPushError: actual.WebPushError,
  }
})

const mockSendNotification = webpush.sendNotification as jest.MockedFunction<
  typeof webpush.sendNotification
>

const payload: PushPayload = {
  title: 'Alex in Weekend Plans',
  body: 'Hello!',
  convoId: 'convo',
  url: '/convo',
  tag: 'convo',
}

const createSubscription = () => {
  const subscription = new PushSubscription({
    id: 'subscription-id',
    endpoint: 'https://push.example.com/send/1',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  })
  subscription.delete = jest.fn()
  return subscription
}

const pushServiceError = (statusCode: number) =>
  new WebPushError('Push failed', statusCode, {}, '', 'https://push.example.com')

describe('sendPush', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends the payload as JSON to the subscription', async () => {
    const subscription = createSubscription()

    await sendPush(subscription, payload)

    expect(mockSendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.com/send/1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      },
      JSON.stringify(payload),
      expect.objectContaining({ TTL: expect.any(Number) }),
    )
  })

  it.each([404, 410])(
    'deletes the subscription when the push service responds %i',
    async (statusCode) => {
      const subscription = createSubscription()
      mockSendNotification.mockRejectedValueOnce(pushServiceError(statusCode))

      await sendPush(subscription, payload)

      expect(subscription.delete).toHaveBeenCalled()
    },
  )

  it('logs other failures and keeps the subscription', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    const subscription = createSubscription()
    mockSendNotification.mockRejectedValueOnce(pushServiceError(500))

    await sendPush(subscription, payload)

    expect(subscription.delete).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
