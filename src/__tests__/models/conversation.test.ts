import Conversation from '../../models/conversation'
import query from '../../util/db'
import {
  createMockQueryResult,
  createMockConversationRow,
} from '../helpers/db-mock'

jest.mock('../../util/db')

const mockQuery = query as jest.MockedFunction<typeof query>

describe('Conversation Model', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create a conversation instance with required properties', () => {
      const conversation = new Conversation({
        name: 'Test Conversation',
      })

      expect(conversation.name).toBe('Test Conversation')
      expect(conversation.id).toBeUndefined()
      expect(conversation.creatorId).toBeUndefined()
    })

    it('should create a conversation with all properties', () => {
      const createdAt = new Date('2024-01-01')
      const updatedAt = new Date('2024-01-02')

      const conversation = new Conversation({
        id: 'convo-123',
        name: 'Test Conversation',
        createdAt,
        updatedAt,
        creatorId: 'user-123',
      })

      expect(conversation.id).toBe('convo-123')
      expect(conversation.name).toBe('Test Conversation')
      expect(conversation.createdAt).toEqual(createdAt)
      expect(conversation.updatedAt).toEqual(updatedAt)
      expect(conversation.creatorId).toBe('user-123')
    })
  })

  describe('update', () => {
    it('should insert new conversation when no id exists', async () => {
      const mockRow = createMockConversationRow({
        name: 'New Conversation',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = new Conversation({
        name: 'New Conversation',
      })

      await conversation.update()

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO conversations (name, creator_id) VALUES ($1, $2) RETURNING *;',
        ['New Conversation', undefined]
      )
      expect(conversation.id).toBe('test-convo-id-123')
      expect(conversation.createdAt).toBeDefined()
      expect(conversation.updatedAt).toBeDefined()
    })

    it('should update existing conversation when id exists', async () => {
      const mockRow = createMockConversationRow({
        convo_id: 'convo-123',
        name: 'Updated Conversation',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = new Conversation({
        id: 'convo-123',
        name: 'Updated Conversation',
      })

      await conversation.update()

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE conversations SET name = $1, creator_id = $2 WHERE convo_id = $3 RETURNING *;',
        ['Updated Conversation', undefined, 'convo-123']
      )
      expect(conversation.name).toBe('Updated Conversation')
    })

    it('should handle creator_id when provided', async () => {
      const mockRow = createMockConversationRow({
        creator_id: 'user-123',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = new Conversation({
        name: 'Test Conversation',
        creatorId: 'user-123',
      })

      await conversation.update()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['Test Conversation', 'user-123'])
      )
      expect(conversation.creatorId).toBe('user-123')
    })
  })

  describe('delete', () => {
    it('should delete conversation from database', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([{ convo_id: 'convo-123' }], 1))

      const conversation = new Conversation({
        id: 'convo-123',
        name: 'Test Conversation',
      })

      await conversation.delete()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM conversations WHERE convo_id = $1'),
        ['convo-123']
      )
    })

    it('should return early when conversation has no id', async () => {
      const conversation = new Conversation({
        name: 'Test Conversation',
      })

      await conversation.delete()

      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe('getDeletionDate', () => {
    it('should calculate deletion date as 30 days after updatedAt', () => {
      const updatedAt = new Date('2024-01-01T00:00:00Z')
      const conversation = new Conversation({
        name: 'Test Conversation',
        updatedAt,
      })

      const deletionDate = conversation.getDeletionDate()

      expect(deletionDate).toBeDefined()
      const expectedDate = new Date('2024-01-31T00:00:00Z')
      expect(deletionDate).toEqual(expectedDate)
    })

    it('should return undefined when no updatedAt is set', () => {
      const conversation = new Conversation({
        name: 'Test Conversation',
      })

      const deletionDate = conversation.getDeletionDate()

      expect(deletionDate).toBeUndefined()
    })

    it('should handle leap years correctly', () => {
      const updatedAt = new Date('2024-02-01T00:00:00Z') // 2024 is a leap year
      const conversation = new Conversation({
        name: 'Test Conversation',
        updatedAt,
      })

      const deletionDate = conversation.getDeletionDate()

      expect(deletionDate).toBeDefined()
      const expectedDate = new Date('2024-03-02T00:00:00Z')
      expect(deletionDate).toEqual(expectedDate)
    })
  })

  describe('findById', () => {
    it('should return conversation when found', async () => {
      const mockRow = createMockConversationRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = await Conversation.findById('test-convo-id-123')

      expect(conversation).toBeInstanceOf(Conversation)
      expect(conversation.id).toBe('test-convo-id-123')
      expect(conversation.name).toBe('Test Conversation')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE convo_id = $1;',
        ['test-convo-id-123']
      )
    })

    it('should throw error when conversation not found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await expect(Conversation.findById('nonexistent-id')).rejects.toThrow(
        'There is no conversation with that ID.'
      )
    })

    it('should map all fields correctly', async () => {
      const createdAt = new Date('2024-01-01')
      const updatedAt = new Date('2024-01-02')
      const mockRow = createMockConversationRow({
        created_at: createdAt,
        updated_at: updatedAt,
        creator_id: 'user-123',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = await Conversation.findById('test-convo-id-123')

      expect(conversation.createdAt).toEqual(createdAt)
      expect(conversation.updatedAt).toEqual(updatedAt)
      expect(conversation.creatorId).toBe('user-123')
    })
  })

  describe('findByUserId', () => {
    it('should return conversations created by user', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: 'convo-1',
          name: 'First Conversation',
          creator_id: 'user-123',
        }),
        createMockConversationRow({
          convo_id: 'convo-2',
          name: 'Second Conversation',
          creator_id: 'user-123',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByUserId('user-123')

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toBeInstanceOf(Conversation)
      expect(conversations[0].name).toBe('First Conversation')
      expect(conversations[1].name).toBe('Second Conversation')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE creator_id = $1 ORDER BY updated_at DESC;',
        ['user-123']
      )
    })

    it('should return empty array when user has no conversations', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const conversations = await Conversation.findByUserId('user-123')

      expect(conversations).toHaveLength(0)
    })

    it('should order by updated_at descending', async () => {
      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-01-10')

      const mockRows = [
        createMockConversationRow({
          convo_id: 'convo-new',
          updated_at: newDate,
        }),
        createMockConversationRow({
          convo_id: 'convo-old',
          updated_at: oldDate,
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByUserId('user-123')

      expect(conversations[0].id).toBe('convo-new')
      expect(conversations[1].id).toBe('convo-old')
    })
  })

  describe('findByAge', () => {
    it('should return conversations older than specified days', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: 'old-convo-1',
        }),
        createMockConversationRow({
          convo_id: 'old-convo-2',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByAge(30)

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toBeInstanceOf(Conversation)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE updated_at < $1;',
        expect.arrayContaining([expect.any(String)])
      )
    })

    it('should delete conversations when shouldDelete is true', async () => {
      const mockRows = [createMockConversationRow()]
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult(mockRows, 1))
        .mockResolvedValueOnce(createMockQueryResult([], 0))

      const conversations = await Conversation.findByAge(30, true)

      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM conversations WHERE updated_at < $1'),
        expect.any(Array)
      )
      expect(conversations).toHaveLength(1)
    })

    it('should not delete conversations when shouldDelete is false', async () => {
      const mockRows = [createMockConversationRow()]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 1))

      await Conversation.findByAge(30, false)

      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array)
      )
    })

    it('should calculate cutoff date correctly', async () => {
      const now = new Date('2024-02-15T00:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(now)

      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Conversation.findByAge(30)

      const expectedCutoff = '2024-01-16' // 30 days before Feb 15
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [expectedCutoff]
      )

      jest.useRealTimers()
    })

    it('should return empty array when no old conversations', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const conversations = await Conversation.findByAge(30)

      expect(conversations).toHaveLength(0)
    })

    it('should handle different age thresholds', async () => {
      const now = new Date('2024-02-15T00:00:00Z')
      jest.useFakeTimers()
      jest.setSystemTime(now)

      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Conversation.findByAge(7) // 7 days

      const expectedCutoff = '2024-02-08' // 7 days before Feb 15
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [expectedCutoff]
      )

      jest.useRealTimers()
    })
  })
})
