import express, { NextFunction, Request, Response } from 'express'
import request from 'supertest'

import Conversation from '../../models/conversation'
import PushSubscription from '../../models/push-subscription'
import User from '../../models/user'
import pushRoutes from '../../routes/push'
import RequestError from '../../util/error'

jest.mock('../../util/push-client', () => ({
  pushEnabled: true,
  vapidPublicKey: 'test-public-key',
  sendPush: jest.fn(),
}))

const app = express()
app.use(express.json())
app.use('/push', pushRoutes)
app.use(
  (error: RequestError, req: Request, res: Response, next: NextFunction) => {
    res.status(error.code || 500).json({ message: error.message })
  },
)

let counter = 0

const createLoggedInUser = async () => {
  counter += 1
  const user = await new User({
    displayName: 'Push Route User',
    username: `pushroute${counter}`,
    email: `pushroute${counter}@example.com`,
    hashedPassword: 'not-a-real-hash',
  }).create()
  const { accessToken } = await user.generateTokens()
  return { user, authHeader: `Bearer ${accessToken}` }
}

const createConversation = async () => {
  const conversation = new Conversation({ name: 'Routes', creatorId: null })
  await conversation.update()
  return conversation
}

const newSubscriptionBody = () => {
  counter += 1
  return {
    subscription: {
      endpoint: `https://push.example.com/send/route-${counter}`,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    },
  }
}

const subscribe = async (authHeader?: string) => {
  const body = newSubscriptionBody()
  const req = request(app).post('/push/subscriptions')
  if (authHeader) req.set('Authorization', authHeader)
  const res = await req.send(body)
  return { endpoint: body.subscription.endpoint, res }
}

const notificationStatus = async (convoId: string, endpoint: string) =>
  (await request(app).get(`/push/conversations/${convoId}`).query({ endpoint }))
    .body.enabled

describe('push routes', () => {
  it('returns the VAPID public key', async () => {
    const res = await request(app).get('/push/public-key')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ publicKey: 'test-public-key' })
  })

  it('saves an anonymous subscription and returns its id', async () => {
    const { endpoint, res } = await subscribe()

    expect(res.status).toBe(200)
    const saved = await PushSubscription.findByEndpoint(endpoint)
    expect(res.body.subscriptionId).toBe(saved?.id)
    expect(saved?.userId).toBeNull()
  })

  it('links the subscription to the logged-in user', async () => {
    const { user, authHeader } = await createLoggedInUser()

    const { endpoint } = await subscribe(authHeader)

    expect((await PushSubscription.findByEndpoint(endpoint))?.userId).toBe(
      user.id,
    )
  })

  it('keeps the device id and follows when the browser rotates its endpoint', async () => {
    const conversation = await createConversation()
    const { endpoint: previousEndpoint, res: firstSave } = await subscribe()
    await request(app)
      .put(`/push/conversations/${conversation.id}`)
      .send({ endpoint: previousEndpoint })
      .expect(200)

    const rotated = newSubscriptionBody()
    const res = await request(app)
      .post('/push/subscriptions')
      .send({ ...rotated, previousEndpoint })

    expect(res.body.subscriptionId).toBe(firstSave.body.subscriptionId)
    expect(await PushSubscription.findByEndpoint(previousEndpoint)).toBeNull()
    expect(
      await notificationStatus(conversation.id!, rotated.subscription.endpoint),
    ).toBe(true)
  })

  it('rejects subscriptions without an https endpoint', async () => {
    const body = newSubscriptionBody()
    body.subscription.endpoint = 'http://insecure.example.com/send'

    const res = await request(app).post('/push/subscriptions').send(body)

    expect(res.status).toBe(400)
  })

  it('deletes a subscription', async () => {
    const { endpoint } = await subscribe()

    const res = await request(app)
      .delete('/push/subscriptions')
      .send({ endpoint })

    expect(res.body).toEqual({ removed: true })
    expect(await PushSubscription.findByEndpoint(endpoint)).toBeNull()
  })

  it('turns notifications for a conversation on and off for an anonymous device', async () => {
    const conversation = await createConversation()
    const { endpoint } = await subscribe()

    expect(await notificationStatus(conversation.id!, endpoint)).toBe(false)

    await request(app)
      .put(`/push/conversations/${conversation.id}`)
      .send({ endpoint })
      .expect(200)
    expect(await notificationStatus(conversation.id!, endpoint)).toBe(true)

    await request(app)
      .delete(`/push/conversations/${conversation.id}`)
      .send({ endpoint })
      .expect(200)
    expect(await notificationStatus(conversation.id!, endpoint)).toBe(false)
  })

  it('mutes and unmutes a conversation the logged-in user visited', async () => {
    const conversation = await createConversation()
    const { user, authHeader } = await createLoggedInUser()
    const { endpoint } = await subscribe(authHeader)
    await Conversation.recordVisit(user.id!, conversation.id!)

    expect(await notificationStatus(conversation.id!, endpoint)).toBe(true)

    await request(app)
      .delete(`/push/conversations/${conversation.id}`)
      .set('Authorization', authHeader)
      .send({ endpoint })
      .expect(200)
    expect(await notificationStatus(conversation.id!, endpoint)).toBe(false)

    await request(app)
      .put(`/push/conversations/${conversation.id}`)
      .set('Authorization', authHeader)
      .send({ endpoint })
      .expect(200)
    expect(await notificationStatus(conversation.id!, endpoint)).toBe(true)
  })

  it('responds 404 for an unknown device and 410 for an unknown conversation', async () => {
    const conversation = await createConversation()
    const { endpoint } = await subscribe()

    await request(app)
      .put(`/push/conversations/${conversation.id}`)
      .send({ endpoint: 'https://push.example.com/send/unknown' })
      .expect(404)
    await request(app)
      .put('/push/conversations/00000000-0000-4000-8000-000000000000')
      .send({ endpoint })
      .expect(410)
  })
})
