import Conversation from '../../models/conversation'
import Message from '../../models/message'
import SystemAgent from '../../models/system-agent'
import User from '../../models/user'
import { deleteExpiredRefreshTokens } from '../../util/cron'
import query from '../../util/db'

let usernameCounter = 0

const createUser = async (overrides: Partial<User> = {}): Promise<User> => {
  usernameCounter += 1
  const user = new User({
    displayName: 'Test User',
    username: `user${usernameCounter}`,
    email: `user${usernameCounter}@example.com`,
    hashedPassword: await User.hashPassword('password'),
    ...overrides,
  })
  return user.create()
}

const createConversation = async (
  name: string,
  creatorId: string | null = null,
): Promise<Conversation> => {
  const conversation = new Conversation({ name, creatorId })
  await conversation.update()
  return conversation
}

const sendAnonymousMessage = (convoId: string, content: string) =>
  new Message({
    convoId,
    type: 'text',
    content,
    senderName: 'Guest',
  }).create()

describe('models against SQLite', () => {
  describe('User', () => {
    it('creates a user with parsed dates and booleans', async () => {
      const user = await createUser()

      expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.verified).toBe(false)
      expect(user.disabled).toBe(false)
      expect(user.tokenVersion).toBe(0)
    })

    it('reports duplicate emails and usernames regardless of case', async () => {
      const existing = await createUser()

      await expect(
        createUser({ email: existing.email!.toUpperCase() }),
      ).rejects.toThrow('Email already in use.')
      await expect(
        createUser({ username: existing.username!.toUpperCase() }),
      ).rejects.toThrow('Username already in use.')
    })

    it('finds users by email and username case-insensitively', async () => {
      const user = await createUser()

      const byEmail = await User.findByEmail(user.email!.toUpperCase())
      const byUsername = await User.findByUsername(user.username!.toUpperCase())

      expect(byEmail?.id).toBe(user.id)
      expect(byUsername?.id).toBe(user.id)
      expect(await User.accountWithEmailExists(user.email!)).toBe(true)
      expect(await User.accountWithUsernameExists('nobody')).toBe(false)
    })

    it('sets and clears the verification token timestamp', async () => {
      const user = await createUser({ verifyToken: '123456' })
      expect(user.verifyTokenTimestamp).toBeInstanceOf(Date)

      await user.setVerifiedStatus('123456')

      expect(user.verified).toBe(true)
      expect(user.verifyToken).toBeNull()
      expect(user.verifyTokenTimestamp).toBeNull()
    })

    it('rejects an expired verification code', async () => {
      const user = await createUser({ verifyToken: '123456' })
      await query(
        'UPDATE users SET verify_token_timestamp = ? WHERE user_id = ?',
        [new Date(Date.now() - 16 * 60 * 1000), user.id],
      )

      await expect(user.setVerifiedStatus('123456')).rejects.toThrow(
        'The verification token is expired.',
      )
    })

    it('resets a password and invalidates existing sessions', async () => {
      const user = await createUser()
      const { accessToken, refreshToken } = await user.generateTokens()
      expect(await User.validateAccessToken(accessToken)).not.toBeNull()
      expect(await User.validateRefreshToken(refreshToken)).not.toBeNull()

      await user.beginPasswordReset()
      expect(user.resetPasswordTokenTimestamp).toBeInstanceOf(Date)
      const found = await User.findByResetPasswordToken(user.resetPasswordToken!)
      await found!.completePasswordReset(user.resetPasswordToken!, 'new-pass')

      expect(await found!.verifyPassword('new-pass')).toBe(true)
      expect(found!.resetPasswordToken).toBeNull()
      expect(await User.validateAccessToken(accessToken)).toBeNull()
      expect(await User.validateRefreshToken(refreshToken)).toBeNull()
    })

    it('revokes a single refresh token session', async () => {
      const user = await createUser()
      const { refreshToken } = await user.generateTokens({
        userAgent: 'jest',
        ip: '127.0.0.1',
      })

      await User.revokeSession(refreshToken)

      expect(await User.validateRefreshToken(refreshToken)).toBeNull()
    })

    it('removes sessions that expired more than 14 days ago', async () => {
      const user = await createUser()
      const daysAgo = (days: number) =>
        new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const recentlyExpired = await User.storeRefreshToken(user.id!, 'recent')
      const longExpired = await User.storeRefreshToken(user.id!, 'long-ago')
      const expireSession = (sessionId: string, expiresAt: Date) =>
        query('UPDATE sessions SET expires_at = ? WHERE session_id = ?', [
          expiresAt,
          sessionId,
        ])
      await expireSession(recentlyExpired, daysAgo(1))
      await expireSession(longExpired, daysAgo(15))

      await deleteExpiredRefreshTokens()
      const remaining = await query(
        'SELECT session_id FROM sessions WHERE user_id = ?',
        [user.id],
      )

      expect(remaining.rows.map((row) => row.session_id)).toEqual([
        recentlyExpired,
      ])
    })

    it('deletes a user along with the conversations they created', async () => {
      const user = await createUser()
      const conversation = await createConversation('Mine', user.id)

      await user.delete()

      expect(await User.findById(user.id!)).toBeNull()
      await expect(Conversation.findById(conversation.id!)).rejects.toThrow(
        'There is no conversation with that ID.',
      )
    })
  })

  describe('Conversation', () => {
    it('creates and renames a conversation with a fresh updatedAt', async () => {
      const conversation = await createConversation('Original')
      const createdUpdatedAt = conversation.updatedAt!
      await query('UPDATE conversations SET updated_at = ? WHERE convo_id = ?', [
        '2020-01-01T00:00:00.000Z',
        conversation.id,
      ])

      conversation.name = 'Renamed'
      await conversation.update()

      expect(conversation.name).toBe('Renamed')
      expect(conversation.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        createdUpdatedAt.getTime(),
      )
      expect(conversation.getDeletionDate()).toBeInstanceOf(Date)
    })

    it('records visits once per user and lists them for the user', async () => {
      const user = await createUser()
      const visited = await createConversation('Visited')
      const owned = await createConversation('Owned', user.id)

      await Conversation.recordVisit(user.id!, visited.id!)
      await Conversation.recordVisit(user.id!, visited.id!)
      const forUser = await Conversation.findForUser(user.id!)
      const visitedOnly = await Conversation.findByVisitor(user.id!)
      const ownedOnly = await Conversation.findForUser(user.id!, true)

      expect(forUser.map((c) => c.id)).toEqual([visited.id, owned.id])
      expect(forUser[0].visitedAt).toBeInstanceOf(Date)
      expect(forUser[1].visitedAt).toBeNull()
      expect(visitedOnly.map((c) => c.id)).toEqual([visited.id])
      expect(visitedOnly[0].visitedAt).toBeUndefined()
      expect(ownedOnly.map((c) => c.id)).toEqual([owned.id])
      expect(await Conversation.removeVisit(user.id!, visited.id!)).toBe(true)
      expect(await Conversation.removeVisit(user.id!, visited.id!)).toBe(false)
    })

    it('finds conversations a user created or sent messages in', async () => {
      const user = await createUser()
      const owned = await createConversation('Owned', user.id)
      const joined = await createConversation('Joined')
      await new Message({
        convoId: joined.id!,
        senderId: user.id,
        type: 'text',
        content: 'hello',
      }).create()

      const ids = await Conversation.findIdsByParticipant(user.id!)

      expect(ids.sort()).toEqual([owned.id, joined.id].sort())
    })

    it('deletes conversations and their messages after inactivity', async () => {
      const stale = await createConversation('Stale')
      const fresh = await createConversation('Fresh')
      await sendAnonymousMessage(stale.id!, 'old news')
      await query('UPDATE conversations SET updated_at = ? WHERE convo_id = ?', [
        '2020-01-01T00:00:00.000Z',
        stale.id,
      ])

      const expired = await Conversation.findByAge(30, true)

      expect(expired.map((c) => c.id)).toEqual([stale.id])
      await expect(Conversation.findById(stale.id!)).rejects.toThrow()
      expect((await Conversation.findById(fresh.id!)).id).toBe(fresh.id)
      const orphans = await query('SELECT * FROM messages WHERE convo_id = ?', [
        stale.id,
      ])
      expect(orphans.rowCount).toBe(0)
    })
  })

  describe('Message', () => {
    it('creates user, anonymous, and system messages', async () => {
      const user = await createUser()
      const conversation = await createConversation('Chat')
      const agent = await SystemAgent.findOrCreate({
        displayName: 'Gemma',
        modelName: 'gemma4',
      })

      const fromUser = await new Message({
        convoId: conversation.id!,
        senderId: user.id,
        type: 'text',
        content: 'hi',
      }).create()
      const fromGuest = await sendAnonymousMessage(conversation.id!, 'hey')
      const fromAgent = await new Message({
        convoId: conversation.id!,
        agentId: agent.id,
        type: 'text',
        content: 'hello',
      }).create()

      expect(fromUser.senderType).toBe('user')
      expect(fromGuest.senderType).toBe('anonymous')
      expect(fromAgent.senderType).toBe('system')
      expect(fromUser.createdAt).toBeInstanceOf(Date)
    })

    it('updates and deletes a message', async () => {
      const conversation = await createConversation('Chat')
      const message = await sendAnonymousMessage(conversation.id!, 'draft')

      await message.update({ content: 'final' })
      const reloaded = await Message.findById(message.id!)
      await message.delete()

      expect(reloaded?.content).toBe('final')
      expect(await message.isCreated()).toBe(false)
    })

    it('pages through messages with before and after cursors', async () => {
      const conversation = await createConversation('Chat')
      for (const content of ['one', 'two', 'three', 'four', 'five']) {
        await sendAnonymousMessage(conversation.id!, content)
      }
      const contentsOf = (messages: Message[]) => messages.map((m) => m.content)

      const newest = await Message.listByConversation(conversation.id!, {
        limit: 2,
        order: 'desc',
      })
      const lastShown = newest.messages[newest.messages.length - 1]
      const older = await Message.listByConversation(conversation.id!, {
        limit: 2,
        order: 'desc',
        before: JSON.parse(
          JSON.stringify({ createdAt: lastShown.createdAt, id: lastShown.id }),
        ),
      })
      const all = await Message.listByConversation(conversation.id!)
      const afterFirst = await Message.listByConversation(conversation.id!, {
        after: all.pageInfo.nextBefore,
      })

      expect(newest.pageInfo.hasMore).toBe(true)
      expect(contentsOf(older.messages)).toEqual(
        contentsOf(all.messages).reverse().slice(2, 4),
      )
      expect(afterFirst.messages).toHaveLength(4)
    })
  })

  describe('SystemAgent', () => {
    it('reuses the same agent for a model name', async () => {
      const first = await SystemAgent.findOrCreate({
        displayName: 'Llama',
        modelName: 'llama',
      })
      const second = await SystemAgent.findOrCreate({
        displayName: 'Llama',
        modelName: 'llama',
        avatarUrl: 'http://example.com/llama.png',
      })

      expect(second.id).toBe(first.id)
      expect(second.avatarUrl).toBe('http://example.com/llama.png')
      expect((await SystemAgent.findByModelName('llama'))?.id).toBe(first.id)
    })
  })
})
