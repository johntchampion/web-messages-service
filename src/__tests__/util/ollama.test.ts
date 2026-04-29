import { generateAIResponse } from '../../util/ollama'
import Message from '../../models/message'
import Conversation from '../../models/conversation'
import SystemAgent from '../../models/system-agent'

jest.mock('ollama', () => {
  const mockChat = jest.fn()
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      chat: mockChat,
    })),
    __mockChat: mockChat,
  }
})

const { __mockChat: mockChat } = jest.requireMock('ollama')

const mockConversation = { name: 'Test Chat' } as Conversation
const mockAgent = { displayName: 'Gemma', modelName: 'gemma4', id: 'agent-1' } as unknown as SystemAgent

describe('Ollama Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateAIResponse', () => {
    it('should generate a response from conversation messages', async () => {
      mockChat.mockResolvedValue({
        message: { content: 'Hello! How can I help?' },
      })

      const messages = [
        new Message({
          convoId: 'convo-1',
          type: 'text',
          content: 'Hi there',
          senderName: 'Alice',
          senderType: 'user',
        }),
      ]

      const result = await generateAIResponse(messages, mockConversation, mockAgent)

      expect(result).toBe('Hello! How can I help?')
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemma4',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              role: 'user',
              content: 'Alice: Hi there',
            }),
          ]),
          stream: false,
        })
      )
    })

    it('should map system messages as assistant role', async () => {
      mockChat.mockResolvedValue({
        message: { content: 'Follow-up response' },
      })

      const messages = [
        new Message({
          convoId: 'convo-1',
          type: 'text',
          content: 'Hi',
          senderName: 'Bob',
          senderType: 'user',
        }),
        new Message({
          convoId: 'convo-1',
          type: 'text',
          content: 'Hello Bob!',
          senderType: 'system',
          agentId: 'agent-1',
        }),
      ]

      await generateAIResponse(messages, mockConversation, mockAgent)

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'assistant', content: 'Hello Bob!' }),
          ]),
        })
      )
    })

    it('should include conversation name in system prompt', async () => {
      mockChat.mockResolvedValue({
        message: { content: 'Response' },
      })

      await generateAIResponse([], { name: 'My Cool Chat' } as Conversation, mockAgent)

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('My Cool Chat'),
            }),
          ]),
        })
      )
    })

    it('should throw on empty response', async () => {
      mockChat.mockResolvedValue({
        message: { content: '' },
      })

      await expect(
        generateAIResponse([], mockConversation, mockAgent)
      ).rejects.toThrow('Ollama returned an empty response.')
    })

    it('should throw on whitespace-only response', async () => {
      mockChat.mockResolvedValue({
        message: { content: '   ' },
      })

      await expect(
        generateAIResponse([], mockConversation, mockAgent)
      ).rejects.toThrow('Ollama returned an empty response.')
    })

    it('should truncate responses exceeding 4096 bytes', async () => {
      const longContent = 'a'.repeat(5000)
      mockChat.mockResolvedValue({
        message: { content: longContent },
      })

      const result = await generateAIResponse([], mockConversation, mockAgent)

      expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(4096)
    })

    it('should use "User" as default sender name when senderName is null', async () => {
      mockChat.mockResolvedValue({
        message: { content: 'Response' },
      })

      const messages = [
        new Message({
          convoId: 'convo-1',
          type: 'text',
          content: 'Hello',
          senderType: 'user',
        }),
      ]

      await generateAIResponse(messages, mockConversation, mockAgent)

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'User: Hello',
            }),
          ]),
        })
      )
    })
  })
})
