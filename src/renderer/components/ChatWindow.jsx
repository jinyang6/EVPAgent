import { useRef } from 'react'
import MessageList from '@/components/messages/MessageList'
import MessageInput from './MessageInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { getProviderById } from '@/config/providers'
import { useProvider } from '@/contexts/ProviderContext'
import { useConversation } from '@/contexts/ConversationContext'
import { useError } from '@/contexts/ErrorContext'
import { sendMessage as sendStreamingMessage } from '@/core/chat/ChatManager'
import { formatMessageForAPI, formatMessagesForAPI } from '@/utils/messageFormatters'
import { handleStreamingError } from '@/utils/errorHandlers'
import { createStreamingCallbacks } from '@/utils/streamingHelpers'

// ─── ChatWindow ───────────────────────────────────────────────────────────────

function ChatWindow({ onOpenSettings }) {
  const _sendingRef = useRef(false)

  const { apiKeys, isLoading } = useProvider()

  const currentProvider = 'evpagent'
  const currentModel = 'probe'
  const providerInfo = getProviderById(currentProvider)

  const {
    messages,
    isConversationStreaming,
    isAnyConversationStreaming,
    getStreamingConversationId,
    startStreaming,
    stopStreaming,
    addMessage,
    updateLastMessage,
    updateLastMessageReasoning,
    markReasoningComplete,
    replaceMessages,
    deleteMessage,
    currentConversationId,
    getCurrentConversation,
    getConversationById,
  } = useConversation()
  const { showMissingApiKeyAlert, showFetchErrorAlert, showInvalidApiKeyAlert } = useError()

  // ── Shared helpers ────────────────────────────────────────────────────────

  /** Synchronous guard — returns false and bails if any stream is active. */
  function guardSend() {
    if (_sendingRef.current || isAnyConversationStreaming()) return false
    _sendingRef.current = true
    return true
  }

  /** Create the streaming callbacks bag used by every send path. */
  function makeCallbacks(conversationId) {
    return createStreamingCallbacks({
      conversationId,
      updateLastMessage,
      updateLastMessageReasoning,
      markReasoningComplete,
      getConversationById,
      stopStreaming,
      metadata: {
        timestamp: new Date().toISOString(),
        model: currentModel,
        provider: currentProvider,
      },
      onError: (error) => {
        handleStreamingError({
          error,
          providerName: providerInfo.name,
          errorHandlers: { showFetchErrorAlert, showInvalidApiKeyAlert, showMissingApiKeyAlert },
          onOpenSettings,
        })
      },
    })
  }

  /** Check for API key and show alert if missing. Returns false if blocked. */
  function requireApiKey() {
    const apiKey = apiKeys[currentProvider]
    if (!apiKey) {
      showMissingApiKeyAlert(providerInfo.name, () => onOpenSettings?.())
      return false
    }
    return apiKey
  }

  // ── Send / Stop / Retry / Edit ────────────────────────────────────────────

  const handleSendMessage = async (messageContent, attachments = []) => {
    const apiKey = requireApiKey()
    if (!apiKey) return
    if (!guardSend()) return

    const abortSignal = startStreaming(currentConversationId)

    try {
      await addMessage({
        role: 'user', content: messageContent,
        model: currentModel, provider: currentProvider,
        attachments: attachments.length > 0 ? attachments : undefined,
      }, currentConversationId)

      await addMessage({
        role: 'assistant', content: '',
        model: currentModel, provider: currentProvider,
      }, currentConversationId)

      const messagesForApi = [
        ...(await formatMessagesForAPI(getCurrentConversation()?.messages || [])),
        await formatMessageForAPI({ role: 'user', content: messageContent }, attachments),
      ]

      await sendStreamingMessage({
        providerId: currentProvider,
        apiKey, model: currentModel, messages: messagesForApi,
        ...makeCallbacks(currentConversationId),
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected error:', error)
      stopStreaming(currentConversationId)
    } finally {
      _sendingRef.current = false
    }
  }

  const handleStopGeneration = () => {
    const id = getStreamingConversationId()
    if (id) stopStreaming(id)
  }

  const handleRetry = async (assistantMessage) => {
    const apiKey = requireApiKey()
    if (!apiKey) return
    if (!guardSend()) return

    const freshMessages = getCurrentConversation()?.messages || []
    const messageIndex = freshMessages.findIndex(m => m.id === assistantMessage.id)
    if (messageIndex <= 0) return
    const userMessage = freshMessages[messageIndex - 1]
    if (userMessage.role !== 'user') return

    const messagesForApi = await formatMessagesForAPI(freshMessages.slice(0, messageIndex))

    // Reset the assistant message to empty for re-generation
    updateLastMessage('', false, {
      timestamp: new Date().toISOString(),
      model: currentModel, provider: currentProvider,
      reasoning: '', isReasoningComplete: false,
    })

    const abortSignal = startStreaming(currentConversationId)

    try {
      await sendStreamingMessage({
        providerId: currentProvider,
        apiKey, model: currentModel, messages: messagesForApi,
        ...makeCallbacks(currentConversationId),
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected retry error:', error)
      stopStreaming(currentConversationId)
    } finally {
      _sendingRef.current = false
    }
  }

  const handleEditUserMessage = async (userMessage, newContent) => {
    const apiKey = requireApiKey()
    if (!apiKey) return
    if (!guardSend()) return

    const freshMessages = getCurrentConversation()?.messages || []
    const messageIndex = freshMessages.findIndex(m => m.id === userMessage.id)
    if (messageIndex < 0) return

    let messagesForApi
    try {
      const updatedMessages = [...freshMessages]
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
        timestamp: new Date().toISOString(),
      }
      const messagesUpToEdit = updatedMessages.slice(0, messageIndex + 1)
      await replaceMessages(messagesUpToEdit)
      messagesForApi = await formatMessagesForAPI(messagesUpToEdit)

      await addMessage({
        role: 'assistant', content: '',
        reasoning: '', isReasoningComplete: false,
        model: currentModel, provider: currentProvider,
      }, currentConversationId)
    } catch (error) {
      console.error('Error editing message:', error)
      showFetchErrorAlert(providerInfo.name, 'Failed to edit message. Please try again.')
      return
    }

    const abortSignal = startStreaming(currentConversationId)

    try {
      await sendStreamingMessage({
        providerId: currentProvider,
        apiKey, model: currentModel, messages: messagesForApi,
        ...makeCallbacks(currentConversationId),
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected edit error:', error)
      stopStreaming(currentConversationId)
    } finally {
      _sendingRef.current = false
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">Loading configuration...</p>
          </div>
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0 min-w-0">
      <MessageList
        messages={messages}
        onRetry={handleRetry}
        onEditUserMessage={handleEditUserMessage}
        onDeleteMessage={deleteMessage}
        isStreaming={isConversationStreaming(currentConversationId)}
      />
      <MessageInput
        onSendMessage={handleSendMessage}
        isStreaming={isAnyConversationStreaming()}
        onStopGeneration={handleStopGeneration}
      />
    </div>
  )
}

export default ChatWindow
