import Message from '../models/message'
import SystemAgent from '../models/system-agent'
import Conversation from '../models/conversation'
import { aiEnabled, generateAIResponse } from './ollama'
import { broadcastMessage, broadcastTypingIndicator } from './io'

/**
 * Orchestrates the full AI response flow:
 * 1. Fetches recent conversation context
 * 2. Finds or creates the agent record
 * 3. Generates a response via Ollama
 * 4. Saves the AI message to the database
 * 5. Broadcasts the message to the conversation room
 *
 * This function is designed to be called fire-and-forget.
 * Errors are caught and logged, never propagated.
 */
export async function handleAIResponse(
  conversation: Conversation,
): Promise<void> {
  if (!aiEnabled) return

  const agent = await SystemAgent.findOrCreate({
    displayName: 'Gemma',
    modelName: 'gemma4',
  })

  // Emit immediately, then re-emit every 1500ms to keep the frontend debounce
  // timer alive for the duration of generation.
  broadcastTypingIndicator(conversation.id!, agent.displayName)
  const typingInterval = setInterval(() => {
    broadcastTypingIndicator(conversation.id!, agent.displayName)
  }, 1500)

  try {
    const { messages } = await Message.listByConversation(conversation.id!, {
      limit: 50,
      order: 'asc',
    })

    const responseText = await generateAIResponse(messages, conversation, agent)

    const aiMessage = new Message({
      convoId: conversation.id!,
      content: responseText,
      type: 'text',
      senderId: null,
      senderType: 'system',
      agentId: agent.id,
      senderName: agent.displayName,
      senderAvatar: agent.avatarUrl,
    })
    await aiMessage.create()

    broadcastMessage(conversation.id!, aiMessage)
  } catch (error) {
    console.error('AI response failed:', error)
  } finally {
    clearInterval(typingInterval)
  }
}
