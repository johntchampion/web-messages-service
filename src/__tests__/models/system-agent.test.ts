import SystemAgent from '../../models/system-agent'
import query from '../../util/db'
import {
  createMockQueryResult,
  createMockSystemAgentRow,
} from '../helpers/db-mock'

jest.mock('../../util/db')

const mockQuery = query as jest.MockedFunction<typeof query>

describe('SystemAgent Model', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create a system agent instance with required properties', () => {
      const agent = new SystemAgent({
        displayName: 'Gemma',
        modelName: 'gemma4',
      })

      expect(agent.displayName).toBe('Gemma')
      expect(agent.modelName).toBe('gemma4')
      expect(agent.avatarUrl).toBeNull()
    })

    it('should handle optional properties', () => {
      const agent = new SystemAgent({
        id: '880e8400-e29b-41d4-a716-446655440003',
        displayName: 'Gemma',
        modelName: 'gemma4',
        avatarUrl: 'http://example.com/avatar.png',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      })

      expect(agent.id).toBe('880e8400-e29b-41d4-a716-446655440003')
      expect(agent.avatarUrl).toBe('http://example.com/avatar.png')
    })
  })

  describe('findByModelName', () => {
    it('should return an agent when found', async () => {
      const mockRow = createMockSystemAgentRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const agent = await SystemAgent.findByModelName('gemma4')

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM system_agents WHERE model_name = $1',
        ['gemma4']
      )
      expect(agent).not.toBeNull()
      expect(agent!.displayName).toBe('Gemma')
      expect(agent!.modelName).toBe('gemma4')
    })

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const agent = await SystemAgent.findByModelName('nonexistent')

      expect(agent).toBeNull()
    })
  })

  describe('findOrCreate', () => {
    it('should upsert and return the agent', async () => {
      const mockRow = createMockSystemAgentRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const agent = await SystemAgent.findOrCreate({
        displayName: 'Gemma',
        modelName: 'gemma4',
      })

      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (model_name)'),
        ['Gemma', 'gemma4', null]
      )
      expect(agent.modelName).toBe('gemma4')
    })

    it('should include avatarUrl when provided', async () => {
      const mockRow = createMockSystemAgentRow({ avatar_url: 'http://example.com/avatar.png' })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const agent = await SystemAgent.findOrCreate({
        displayName: 'Gemma',
        modelName: 'gemma4',
        avatarUrl: 'http://example.com/avatar.png',
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO system_agents'),
        ['Gemma', 'gemma4', 'http://example.com/avatar.png']
      )
      expect(agent.avatarUrl).toBe('http://example.com/avatar.png')
    })

    it('should throw if upsert returns no rows', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      await expect(
        SystemAgent.findOrCreate({ displayName: 'Gemma', modelName: 'gemma4' })
      ).rejects.toThrow('Failed to upsert system agent.')
    })
  })

  describe('parseRow', () => {
    it('should map database row to SystemAgent instance', () => {
      const row = createMockSystemAgentRow({
        avatar_url: 'http://example.com/avatar.png',
      })

      const agent = SystemAgent.parseRow(row)

      expect(agent.id).toBe('880e8400-e29b-41d4-a716-446655440003')
      expect(agent.displayName).toBe('Gemma')
      expect(agent.modelName).toBe('gemma4')
      expect(agent.avatarUrl).toBe('http://example.com/avatar.png')
      expect(agent.createdAt).toEqual(new Date('2024-01-01'))
      expect(agent.updatedAt).toEqual(new Date('2024-01-01'))
    })
  })
})
