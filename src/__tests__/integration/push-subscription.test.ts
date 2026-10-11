import Conversation from '../../models/conversation'
import ConversationMute from '../../models/conversation-mute'
import PushSubscription from '../../models/push-subscription'
import User from '../../models/user'

let counter = 0

const createUser = async (): Promise<User> => {
  counter += 1
  const user = new User({
    displayName: 'Test User',
    username: `pushuser${counter}`,
    email: `pushuser${counter}@example.com`,
    hashedPassword: 'not-a-real-hash',
  })
  return user.create()
}

const createConversation = async (): Promise<Conversation> => {
  const conversation = new Conversation({ name: 'Push Test', creatorId: null })
  await conversation.update()
  return conversation
}

const subscribeDevice = (userId: string | null = null) => {
  counter += 1
  return new PushSubscription({
    userId,
    endpoint: `https://push.example.com/send/${counter}`,
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  }).upsert()
}

const recipientIds = async (
  convoId: string,
  exclusions?: Parameters<typeof PushSubscription.findRecipientsForConversation>[1],
) =>
  (await PushSubscription.findRecipientsForConversation(convoId, exclusions))
    .map((subscription) => subscription.id)
    .sort()

describe('PushSubscription against SQLite', () => {
  it('upserts by endpoint, keeping the id and replacing the linked user', async () => {
    const user = await createUser()
    const original = await subscribeDevice(user.id!)

    const resaved = await new PushSubscription({
      userId: null,
      endpoint: original.endpoint,
      p256dh: 'new-p256dh',
      auth: 'new-auth',
    }).upsert()

    expect(resaved.id).toBe(original.id)
    expect(resaved.userId).toBeNull()
    expect(resaved.p256dh).toBe('new-p256dh')
    expect(await PushSubscription.findByEndpoint(original.endpoint)).toEqual(
      resaved,
    )
  })

  it('deletes a subscription by endpoint', async () => {
    const subscription = await subscribeDevice()

    expect(await PushSubscription.deleteByEndpoint(subscription.endpoint)).toBe(
      true,
    )
    expect(await PushSubscription.findByEndpoint(subscription.endpoint)).toBeNull()
    expect(await PushSubscription.deleteByEndpoint(subscription.endpoint)).toBe(
      false,
    )
  })

  it('finds anonymous devices that follow the conversation', async () => {
    const conversation = await createConversation()
    const follower = await subscribeDevice()
    await subscribeDevice()

    await follower.follow(conversation.id!)
    await follower.follow(conversation.id!)

    expect(await recipientIds(conversation.id!)).toEqual([follower.id])
    expect(await follower.isNotifiedAbout(conversation.id!)).toBe(true)

    await follower.unfollow(conversation.id!)
    expect(await recipientIds(conversation.id!)).toEqual([])
    expect(await follower.isNotifiedAbout(conversation.id!)).toBe(false)
  })

  it('finds every device of users who visited the conversation, once each', async () => {
    const conversation = await createConversation()
    const visitor = await createUser()
    const phone = await subscribeDevice(visitor.id!)
    const laptop = await subscribeDevice(visitor.id!)
    await Conversation.recordVisit(visitor.id!, conversation.id!)
    await phone.follow(conversation.id!)

    expect(await recipientIds(conversation.id!)).toEqual(
      [phone.id, laptop.id].sort(),
    )
  })

  it('leaves out every device of a user who muted the conversation', async () => {
    const conversation = await createConversation()
    const visitor = await createUser()
    const device = await subscribeDevice(visitor.id!)
    await Conversation.recordVisit(visitor.id!, conversation.id!)
    await device.follow(conversation.id!)

    await ConversationMute.mute(visitor.id!, conversation.id!)
    expect(await recipientIds(conversation.id!)).toEqual([])
    expect(await device.isNotifiedAbout(conversation.id!)).toBe(false)

    await ConversationMute.unmute(visitor.id!, conversation.id!)
    expect(await recipientIds(conversation.id!)).toEqual([device.id])
  })

  it("leaves out the sender's devices", async () => {
    const conversation = await createConversation()
    const sender = await createUser()
    const senderDevice = await subscribeDevice(sender.id!)
    const anonymousSenderDevice = await subscribeDevice()
    const otherDevice = await subscribeDevice()
    for (const device of [senderDevice, anonymousSenderDevice, otherDevice]) {
      await device.follow(conversation.id!)
    }

    expect(
      await recipientIds(conversation.id!, {
        senderUserId: sender.id,
        senderSubscriptionId: anonymousSenderDevice.id,
      }),
    ).toEqual([otherDevice.id])
  })

  it("unfollows a conversation on all of a user's devices", async () => {
    const conversation = await createConversation()
    const user = await createUser()
    const device = await subscribeDevice(user.id!)
    const otherUsersDevice = await subscribeDevice()
    await device.follow(conversation.id!)
    await otherUsersDevice.follow(conversation.id!)

    await PushSubscription.unfollowForUser(user.id!, conversation.id!)

    expect(await recipientIds(conversation.id!)).toEqual([otherUsersDevice.id])
  })

  it('drops follows when the conversation is deleted', async () => {
    const conversation = await createConversation()
    const device = await subscribeDevice()
    await device.follow(conversation.id!)

    await conversation.delete()

    expect(await recipientIds(conversation.id!)).toEqual([])
  })

  it('keeps a device as anonymous when its user is deleted', async () => {
    const user = await createUser()
    const device = await subscribeDevice(user.id!)

    await user.delete()

    expect((await PushSubscription.findByEndpoint(device.endpoint))?.userId).toBeNull()
  })
})
