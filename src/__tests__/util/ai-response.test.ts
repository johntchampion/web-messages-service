import { handleAIResponse } from '../../util/ai-response'
import Message from '../../models/message'
import SystemAgent from '../../models/system-agent'
import Conversation from '../../models/conversation'
import * as ollamaUtil from '../../util/ollama'
import * as ioUtil from '../../util/io'

jest.mock('../../models/message')
jest.mock('../../models/system-agent')
jest.mock('../../util/ollama')
jest.mock('../../util/io', () => ({
  broadcastMessage: jest.fn(),
  broadcastTypingIndicator: jest.fn(),
}))

const mockListByConversation =
  Message.listByConversation as jest.MockedFunction<
    typeof Message.listByConversation
  >
const mockFindOrCreate = SystemAgent.findOrCreate as jest.MockedFunction<
  typeof SystemAgent.findOrCreate
>
const mockGenerateAIResponse =
  ollamaUtil.generateAIResponse as jest.MockedFunction<
    typeof ollamaUtil.generateAIResponse
  >
const mockBroadcastMessage = ioUtil.broadcastMessage as jest.MockedFunction<
  typeof ioUtil.broadcastMessage
>
const mockBroadcastTypingIndicator =
  ioUtil.broadcastTypingIndicator as jest.MockedFunction<
    typeof ioUtil.broadcastTypingIndicator
  >

describe('AI Response Orchestrator', () => {
  const convoId = '770e8400-e29b-41d4-a716-446655440002'
  const mockConversation = {
    id: convoId,
    name: 'Test Chat',
  } as Conversation

  const mockAgent = {
    id: '880e8400-e29b-41d4-a716-446655440003',
    displayName: 'Gemma',
    modelName: 'gemma4',
    avatarUrl: null,
  } as any

  let mockCreate: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    mockCreate = jest.fn().mockResolvedValue(undefined)

    mockListByConversation.mockResolvedValue({
      messages: [],
      pageInfo: { hasMore: false },
    })

    mockFindOrCreate.mockResolvedValue(mockAgent)

    mockGenerateAIResponse.mockResolvedValue('AI response text')

    ;(Message as unknown as jest.Mock).mockImplementation((props: any) => ({
      ...props,
      create: mockCreate,
    }))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should fetch messages, generate response, save, and broadcast', async () => {
    await handleAIResponse(mockConversation)

    expect(mockListByConversation).toHaveBeenCalledWith(convoId, {
      limit: 50,
      order: 'asc',
    })

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      displayName: 'Gemma',
      modelName: 'gemma4',
    })

    expect(mockGenerateAIResponse).toHaveBeenCalledWith(
      [],
      mockConversation,
      mockAgent
    )

    expect(Message).toHaveBeenCalledWith(
      expect.objectContaining({
        convoId,
        content: 'AI response text',
        type: 'text',
        senderId: null,
        senderType: 'system',
        agentId: '880e8400-e29b-41d4-a716-446655440003',
        senderName: 'Gemma',
      })
    )

    expect(mockCreate).toHaveBeenCalled()
    expect(mockBroadcastMessage).toHaveBeenCalledWith(
      convoId,
      expect.objectContaining({ content: 'AI response text' })
    )
    expect(mockBroadcastTypingIndicator).toHaveBeenCalledWith(convoId, 'Gemma')
  })

  it('should not throw when Ollama fails', async () => {
    mockGenerateAIResponse.mockRejectedValue(new Error('Ollama unreachable'))
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    await expect(handleAIResponse(mockConversation)).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      'AI response failed:',
      expect.any(Error)
    )
    expect(mockBroadcastMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should not throw when message creation fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'))
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    await expect(handleAIResponse(mockConversation)).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('should pass conversation messages to generateAIResponse', async () => {
    const mockMessages = [
      new Message({
        convoId,
        type: 'text',
        content: 'Hello',
        senderName: 'Alice',
      }),
    ]
    mockListByConversation.mockResolvedValue({
      messages: mockMessages,
      pageInfo: { hasMore: false },
    })

    await handleAIResponse(mockConversation)

    expect(mockGenerateAIResponse).toHaveBeenCalledWith(
      mockMessages,
      mockConversation,
      mockAgent
    )
  })
})
