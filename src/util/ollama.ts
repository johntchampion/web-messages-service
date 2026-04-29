import { Ollama, Message as OllamaMessage } from 'ollama'
import Message from '../models/message'
import Conversation from '../models/conversation'
import SystemAgent from '../models/system-agent'

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
})

const MAX_CONTEXT_MESSAGES = 50

const SYSTEM_PROMPT =
  'You are a helpful assistant participating in a group chat conversation. ' +
  'Keep your responses concise, relevant, and friendly. ' +
  'Respond naturally as if you are a participant in the conversation.'

/**
 * Generates an AI response given recent conversation messages.
 * Maps conversation messages to Ollama's chat format and returns the response text.
 */
export async function generateAIResponse(
  messages: Message[],
  conversation: Conversation,
  agent: SystemAgent,
): Promise<string> {
  const ollamaMessages: OllamaMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\nYou are in a conversation called "${conversation.name}".`,
    },
  ]

  for (const msg of messages.slice(-MAX_CONTEXT_MESSAGES)) {
    if (msg.senderType === 'system') {
      ollamaMessages.push({ role: 'assistant', content: msg.content })
    } else {
      const name = msg.senderName ?? 'User'
      ollamaMessages.push({ role: 'user', content: `${name}: ${msg.content}` })
    }
  }

  const response = await ollama.chat({
    model: agent.modelName,
    messages: ollamaMessages,
    think: false,
    stream: false,
  })

  const content = response.message.content
  if (!content || content.trim().length === 0) {
    throw new Error('Ollama returned an empty response.')
  }

  // Truncate if exceeding the 4096-byte message limit
  const maxBytes = 4096
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    let truncated = content
    while (Buffer.byteLength(truncated, 'utf8') > maxBytes) {
      truncated = truncated.slice(0, -1)
    }
    return truncated
  }

  return content
}
