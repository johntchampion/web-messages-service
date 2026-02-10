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
        id: '770e8400-e29b-41d4-a716-446655440002',
        name: 'Test Conversation',
        createdAt,
        updatedAt,
        creatorId: '550e8400-e29b-41d4-a716-446655440000',
      })

      expect(conversation.id).toBe('770e8400-e29b-41d4-a716-446655440002')
      expect(conversation.name).toBe('Test Conversation')
      expect(conversation.createdAt).toEqual(createdAt)
      expect(conversation.updatedAt).toEqual(updatedAt)
      expect(conversation.creatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
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
      expect(conversation.id).toBe('770e8400-e29b-41d4-a716-446655440002')
      expect(conversation.createdAt).toBeDefined()
      expect(conversation.updatedAt).toBeDefined()
    })

    it('should update existing conversation when id exists', async () => {
      const mockRow = createMockConversationRow({
        convo_id: '770e8400-e29b-41d4-a716-446655440002',
        name: 'Updated Conversation',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = new Conversation({
        id: '770e8400-e29b-41d4-a716-446655440002',
        name: 'Updated Conversation',
      })

      await conversation.update()

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE conversations SET name = $1, creator_id = $2 WHERE convo_id = $3 RETURNING *;',
        ['Updated Conversation', undefined, '770e8400-e29b-41d4-a716-446655440002']
      )
      expect(conversation.name).toBe('Updated Conversation')
    })

    it('should handle creator_id when provided', async () => {
      const mockRow = createMockConversationRow({
        creator_id: '550e8400-e29b-41d4-a716-446655440000',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = new Conversation({
        name: 'Test Conversation',
        creatorId: '550e8400-e29b-41d4-a716-446655440000',
      })

      await conversation.update()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['Test Conversation', '550e8400-e29b-41d4-a716-446655440000'])
      )
      expect(conversation.creatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })
  })

  describe('delete', () => {
    it('should delete conversation from database', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([{ convo_id: '770e8400-e29b-41d4-a716-446655440002' }], 1))

      const conversation = new Conversation({
        id: '770e8400-e29b-41d4-a716-446655440002',
        name: 'Test Conversation',
      })

      await conversation.delete()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM conversations WHERE convo_id = $1'),
        ['770e8400-e29b-41d4-a716-446655440002']
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

      const conversation = await Conversation.findById('770e8400-e29b-41d4-a716-446655440002')

      expect(conversation).toBeInstanceOf(Conversation)
      expect(conversation.id).toBe('770e8400-e29b-41d4-a716-446655440002')
      expect(conversation.name).toBe('Test Conversation')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE convo_id = $1;',
        ['770e8400-e29b-41d4-a716-446655440002']
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
        creator_id: '550e8400-e29b-41d4-a716-446655440000',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversation = await Conversation.findById('770e8400-e29b-41d4-a716-446655440002')

      expect(conversation.createdAt).toEqual(createdAt)
      expect(conversation.updatedAt).toEqual(updatedAt)
      expect(conversation.creatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })
  })

  describe('findByUserId', () => {
    it('should return conversations created by user', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440003',
          name: 'First Conversation',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440004',
          name: 'Second Conversation',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByUserId('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toBeInstanceOf(Conversation)
      expect(conversations[0].name).toBe('First Conversation')
      expect(conversations[1].name).toBe('Second Conversation')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE creator_id = $1 ORDER BY updated_at DESC;',
        ['550e8400-e29b-41d4-a716-446655440000']
      )
    })

    it('should return empty array when user has no conversations', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const conversations = await Conversation.findByUserId('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(0)
    })

    it('should order by updated_at descending', async () => {
      const oldDate = new Date('2024-01-01')
      const newDate = new Date('2024-01-10')

      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440005',
          updated_at: newDate,
        }),
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440006',
          updated_at: oldDate,
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByUserId('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations[0].id).toBe('770e8400-e29b-41d4-a716-446655440005')
      expect(conversations[1].id).toBe('770e8400-e29b-41d4-a716-446655440006')
    })
  })

  describe('recordVisit', () => {
    it('should upsert a visit record', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 1))

      await Conversation.recordVisit(
        '550e8400-e29b-41d4-a716-446655440000',
        '770e8400-e29b-41d4-a716-446655440002'
      )

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversation_visits'),
        ['550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002']
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      )
    })

    it('should propagate database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'))

      await expect(
        Conversation.recordVisit(
          '550e8400-e29b-41d4-a716-446655440000',
          '770e8400-e29b-41d4-a716-446655440002'
        )
      ).rejects.toThrow('DB error')
    })
  })

  describe('removeVisit', () => {
    it('should return true when a visit record was deleted', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 1))

      const result = await Conversation.removeVisit(
        '550e8400-e29b-41d4-a716-446655440000',
        '770e8400-e29b-41d4-a716-446655440002'
      )

      expect(result).toBe(true)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM conversation_visits'),
        ['550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002']
      )
    })

    it('should return false when no visit record was found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const result = await Conversation.removeVisit(
        '550e8400-e29b-41d4-a716-446655440000',
        '770e8400-e29b-41d4-a716-446655440002'
      )

      expect(result).toBe(false)
    })
  })

  describe('findByVisitor', () => {
    it('should return conversations visited by user', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440003',
          name: 'Visited Conversation 1',
        }),
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440004',
          name: 'Visited Conversation 2',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findByVisitor('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toBeInstanceOf(Conversation)
      expect(conversations[0].name).toBe('Visited Conversation 1')
      expect(conversations[1].name).toBe('Visited Conversation 2')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INNER JOIN conversation_visits'),
        ['550e8400-e29b-41d4-a716-446655440000']
      )
    })

    it('should filter by owned conversations when ownedOnly is true', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440003',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 1))

      const conversations = await Conversation.findByVisitor(
        '550e8400-e29b-41d4-a716-446655440000',
        true
      )

      expect(conversations).toHaveLength(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.creator_id = $1'),
        ['550e8400-e29b-41d4-a716-446655440000']
      )
    })

    it('should not filter by creator when ownedOnly is false', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Conversation.findByVisitor('550e8400-e29b-41d4-a716-446655440000', false)

      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('creator_id'),
        ['550e8400-e29b-41d4-a716-446655440000']
      )
    })

    it('should return empty array when no visits found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const conversations = await Conversation.findByVisitor('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(0)
    })

    it('should order by visited_at descending', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Conversation.findByVisitor('550e8400-e29b-41d4-a716-446655440000')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY cv.visited_at DESC'),
        expect.any(Array)
      )
    })
  })

  describe('findForUser', () => {
    it('should return both visited and owned conversations', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440003',
          name: 'Visited Conversation',
          visited_at: new Date('2024-01-10'),
        }),
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440004',
          name: 'Owned Conversation',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
          visited_at: null,
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 2))

      const conversations = await Conversation.findForUser('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toBeInstanceOf(Conversation)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN conversation_visits'),
        ['550e8400-e29b-41d4-a716-446655440000']
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cv.user_id = $1 OR c.creator_id = $1'),
        expect.any(Array)
      )
    })

    it('should return owned conversations even when not visited', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440005',
          name: 'Owned but Not Visited',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 1))

      const conversations = await Conversation.findForUser('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(1)
      expect(conversations[0].name).toBe('Owned but Not Visited')
      expect(conversations[0].creatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('should filter by owned conversations when ownedOnly is true', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440006',
          creator_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ]
      mockQuery.mockResolvedValue(createMockQueryResult(mockRows, 1))

      const conversations = await Conversation.findForUser(
        '550e8400-e29b-41d4-a716-446655440000',
        true
      )

      expect(conversations).toHaveLength(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.creator_id = $1'),
        ['550e8400-e29b-41d4-a716-446655440000']
      )
    })

    it('should order by visited_at DESC NULLS LAST, then updated_at DESC', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await Conversation.findForUser('550e8400-e29b-41d4-a716-446655440000')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY cv.visited_at DESC NULLS LAST, c.updated_at DESC'),
        expect.any(Array)
      )
    })

    it('should return empty array when user has no conversations', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const conversations = await Conversation.findForUser('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations).toHaveLength(0)
    })

    it('should map all fields correctly including visited_at', async () => {
      const createdAt = new Date('2024-01-01')
      const updatedAt = new Date('2024-01-02')
      const visitedAt = new Date('2024-01-05')
      const mockRow = createMockConversationRow({
        created_at: createdAt,
        updated_at: updatedAt,
        visited_at: visitedAt,
        creator_id: '550e8400-e29b-41d4-a716-446655440000',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const conversations = await Conversation.findForUser('550e8400-e29b-41d4-a716-446655440000')

      expect(conversations[0].createdAt).toEqual(createdAt)
      expect(conversations[0].updatedAt).toEqual(updatedAt)
      expect(conversations[0].creatorId).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(conversations[0].visitedAt).toEqual(visitedAt)
    })
  })

  describe('findByAge', () => {
    it('should return conversations older than specified days', async () => {
      const mockRows = [
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440007',
        }),
        createMockConversationRow({
          convo_id: '770e8400-e29b-41d4-a716-446655440008',
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
