import Message from '../../models/message'
import query from '../../util/db'
import { createMockQueryResult, createMockMessageRow } from '../helpers/db-mock'

jest.mock('../../util/db')

const mockQuery = query as jest.MockedFunction<typeof query>

describe('Message Model', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create a message instance with required properties', () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Hello world',
      })

      expect(message.convoId).toBe('convo-123')
      expect(message.type).toBe('text')
      expect(message.content).toBe('Hello world')
      expect(message.senderId).toBeNull()
      expect(message.senderName).toBeNull()
    })

    it('should handle optional properties', () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Hello',
        senderId: 'user-123',
        senderName: 'John',
        senderAvatar: 'http://example.com/avatar.jpg',
      })

      expect(message.senderId).toBe('user-123')
      expect(message.senderName).toBe('John')
      expect(message.senderAvatar).toBe('http://example.com/avatar.jpg')
    })
  })

  describe('create', () => {
    it('should create a new message in the database', async () => {
      const mockRow = createMockMessageRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test message',
      })

      await message.create()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining([
          'convo-123',
          null,
          'text',
          'Test message',
          null,
          null,
        ])
      )
      expect(message.id).toBe('test-message-id-123')
      expect(message.createdAt).toBeDefined()
    })

    it('should create message with sender information', async () => {
      const mockRow = createMockMessageRow({
        sender_id: 'user-123',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test message',
        senderId: 'user-123',
      })

      await message.create()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining(['user-123'])
      )
    })

    it('should throw error when content exceeds 4096 bytes', async () => {
      const longContent = 'a'.repeat(4097)
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: longContent,
      })

      await expect(message.create()).rejects.toThrow(
        'Message content exceeds 4096 bytes'
      )
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('should allow content exactly 4096 bytes', async () => {
      const maxContent = 'a'.repeat(4096)
      const mockRow = createMockMessageRow({ content: maxContent })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: maxContent,
      })

      await message.create()

      expect(mockQuery).toHaveBeenCalled()
    })

    it('should throw error when insert fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'))

      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.create()).rejects.toThrow(
        'Failed to insert message.'
      )
    })

    it('should throw error when insert returns no rows', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.create()).rejects.toThrow(
        'Failed to insert message.'
      )
    })
  })

  describe('isCreated', () => {
    it('should return true when message exists', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([{ count: 1 }], 1))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      const result = await message.isCreated()

      expect(result).toBe(true)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 FROM messages WHERE message_id = $1',
        ['message-123']
      )
    })

    it('should return false when message does not exist', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      const result = await message.isCreated()

      expect(result).toBe(false)
    })

    it('should return false when message has no id', async () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      const result = await message.isCreated()

      expect(result).toBe(false)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update message properties', async () => {
      const updatedRow = createMockMessageRow({
        content: 'Updated content',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([updatedRow], 1))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Original',
      })

      await message.update({ content: 'Updated content' })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages SET'),
        expect.arrayContaining(['Updated content', 'message-123'])
      )
      expect(message.content).toBe('Updated content')
    })

    it('should throw error when updating with content exceeding limit', async () => {
      const longContent = 'a'.repeat(4097)
      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Original',
      })

      await expect(message.update({ content: longContent })).rejects.toThrow(
        'Message content exceeds 4096 bytes'
      )
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('should throw error when message has no id', async () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.update({ content: 'New' })).rejects.toThrow(
        'Message has not been persisted yet.'
      )
    })

    it('should reload when no fields to update', async () => {
      const mockRow = createMockMessageRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await message.update({})

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM messages WHERE message_id = $1',
        ['message-123']
      )
    })
  })

  describe('reload', () => {
    it('should reload message data from database', async () => {
      const mockRow = createMockMessageRow({
        content: 'Reloaded content',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Original',
      })

      await message.reload()

      expect(message.content).toBe('Reloaded content')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM messages WHERE message_id = $1',
        ['message-123']
      )
    })

    it('should throw error when message has no id', async () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.reload()).rejects.toThrow(
        'Message has not been persisted yet.'
      )
    })

    it('should throw error when message not found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const message = new Message({
        id: 'nonexistent-id',
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.reload()).rejects.toThrow(
        'Could not reload message.'
      )
    })
  })

  describe('delete', () => {
    it('should delete message from database', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const message = new Message({
        id: 'message-123',
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await message.delete()

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM messages WHERE message_id = $1',
        ['message-123']
      )
    })

    it('should throw error when message has no id', async () => {
      const message = new Message({
        convoId: 'convo-123',
        type: 'text',
        content: 'Test',
      })

      await expect(message.delete()).rejects.toThrow(
        'This user does not exist.'
      )
    })
  })

  describe('findById', () => {
    it('should return message when found', async () => {
      const mockRow = createMockMessageRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const message = await Message.findById('test-message-id-123')

      expect(message).toBeInstanceOf(Message)
      expect(message?.id).toBe('test-message-id-123')
      expect(message?.content).toBe('Test message content')
    })

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const message = await Message.findById('nonexistent-id')

      expect(message).toBeNull()
    })
  })

  describe('listByConversation', () => {
    it('should return messages in ascending order', async () => {
      const mockRows = [
        createMockMessageRow({ message_id: 'msg-1', content: 'First' }),
        createMockMessageRow({ message_id: 'msg-2', content: 'Second' }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const result = await Message.listByConversation('convo-123', {
        order: 'asc',
      })

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].content).toBe('First')
      expect(result.messages[1].content).toBe('Second')
      expect(result.pageInfo.hasMore).toBe(false)
    })

    it('should return messages in descending order', async () => {
      const mockRows = [
        createMockMessageRow({ message_id: 'msg-2', content: 'Second' }),
        createMockMessageRow({ message_id: 'msg-1', content: 'First' }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const result = await Message.listByConversation('convo-123', {
        order: 'desc',
      })

      expect(result.messages[0].content).toBe('Second')
      expect(result.messages[1].content).toBe('First')
    })

    it('should respect limit parameter', async () => {
      const mockRows = Array(11)
        .fill(null)
        .map((_, i) =>
          createMockMessageRow({
            message_id: `msg-${i}`,
            content: `Message ${i}`,
          })
        )
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 11))

      const result = await Message.listByConversation('convo-123', {
        limit: 10,
      })

      expect(result.messages).toHaveLength(10)
      expect(result.pageInfo.hasMore).toBe(true)
    })

    it('should use default limit of 50', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Message.listByConversation('convo-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([51]) // limit + 1
      )
    })

    it('should cap limit at 200', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Message.listByConversation('convo-123', { limit: 500 })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([201]) // capped limit + 1
      )
    })

    it('should handle before cursor for pagination', async () => {
      const beforeDate = new Date('2024-01-01T12:00:00Z')
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Message.listByConversation('convo-123', {
        before: { createdAt: beforeDate, id: 'msg-123' },
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('(m.created_at, m.message_id) <'),
        expect.arrayContaining(['convo-123', beforeDate, 'msg-123'])
      )
    })

    it('should handle after cursor for pagination', async () => {
      const afterDate = new Date('2024-01-01T12:00:00Z')
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Message.listByConversation('convo-123', {
        after: { createdAt: afterDate, id: 'msg-123' },
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('(m.created_at, m.message_id) >'),
        expect.arrayContaining(['convo-123', afterDate, 'msg-123'])
      )
    })

    it('should return pagination cursors', async () => {
      const date1 = new Date('2024-01-01T10:00:00Z')
      const date2 = new Date('2024-01-01T11:00:00Z')
      const mockRows = [
        createMockMessageRow({
          message_id: 'msg-1',
          created_at: date1,
        }),
        createMockMessageRow({
          message_id: 'msg-2',
          created_at: date2,
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const result = await Message.listByConversation('convo-123')

      expect(result.pageInfo.nextBefore).toEqual({
        createdAt: date1,
        id: 'msg-1',
      })
      expect(result.pageInfo.nextAfter).toEqual({
        createdAt: date2,
        id: 'msg-2',
      })
    })

    it('should return undefined cursors when no messages', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const result = await Message.listByConversation('convo-123')

      expect(result.messages).toHaveLength(0)
      expect(result.pageInfo.nextBefore).toBeUndefined()
      expect(result.pageInfo.nextAfter).toBeUndefined()
    })
  })

  describe('parseRow', () => {
    it('should correctly map database row to Message instance', () => {
      const mockRow = createMockMessageRow()
      const message = Message.parseRow(mockRow)

      expect(message).toBeInstanceOf(Message)
      expect(message.id).toBe('test-message-id-123')
      expect(message.convoId).toBe('test-convo-id-123')
      expect(message.type).toBe('text')
      expect(message.content).toBe('Test message content')
      expect(message.senderId).toBe('test-user-id-123')
    })

    it('should handle null values', () => {
      const mockRow = createMockMessageRow({
        sender_id: null,
        sender_name: null,
        sender_avatar: null,
      })
      const message = Message.parseRow(mockRow)

      expect(message.senderId).toBeNull()
      expect(message.senderName).toBeNull()
      expect(message.senderAvatar).toBeNull()
    })
  })
})
