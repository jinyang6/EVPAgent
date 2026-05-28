import { useState, useEffect, useRef, useCallback } from 'react'
import MessageList from '@/components/messages/MessageList'
import MessageInput from './MessageInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { getProviderById } from '@/config/providers'
import { useProvider } from '@/contexts/ProviderContext'
import { useConversation } from '@/contexts/ConversationContext'
import { useModelFetcher } from '@/hooks/useModelFetcher'
import { useError } from '@/contexts/ErrorContext'
import { sendMessage as sendStreamingMessage } from '@/core/chat/ChatManager'
import { formatMessageForAPI, formatMessagesForAPI } from '@/utils/messageFormatters'
import { handleStreamingError } from '@/utils/errorHandlers'
import { createStreamingCallbacks } from '@/utils/streamingHelpers'

// ─── ChatWindow ───────────────────────────────────────────────────────────────

function ChatWindow({ conversationId, onOpenSettings }) {
  const {
    apiKeys,
    isLoading
  } = useProvider()

  const currentProvider = 'evpagent'
  const currentModel = 'probe'
  const providerInfo = getProviderById(currentProvider)

  const {
    messages,
    isConversationStreaming,
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
    getConversationById
  } = useConversation()
  const { showMissingApiKeyAlert, showFetchErrorAlert, showInvalidApiKeyAlert } = useError()

  const handleSendMessage = async (messageContent, attachments = []) => {
    const apiKey = apiKeys[currentProvider]
    if (!apiKey) {
      showMissingApiKeyAlert(providerInfo.name, () => {
        if (onOpenSettings) onOpenSettings()
      })
      return
    }

    const targetConversationId = currentConversationId
    if (isConversationStreaming(targetConversationId)) return

    try {
      await addMessage({
        role: 'user',
        content: messageContent,
        model: currentModel,
        provider: currentProvider,
        attachments: attachments.length > 0 ? attachments : undefined
      }, targetConversationId)

      await addMessage({
        role: 'assistant',
        content: '',
        model: currentModel,
        provider: currentProvider
      }, targetConversationId)
    } catch (error) {
      console.error('Error adding messages:', error)
      showFetchErrorAlert(providerInfo.name, 'Failed to save message. Please try again.')
      return
    }

    const currentUserMessage = await formatMessageForAPI(
      { role: 'user', content: messageContent },
      attachments
    )

    const freshMessages = getCurrentConversation()?.messages || []
    const messagesForApi = [
      ...(await formatMessagesForAPI(freshMessages)),
      currentUserMessage
    ]

    const abortSignal = startStreaming(targetConversationId)

    const sendMetadata = {
      timestamp: new Date().toISOString(),
      model: currentModel,
      provider: currentProvider
    }

    const streamingCallbacks = createStreamingCallbacks({
      conversationId: targetConversationId,
      updateLastMessage,
      updateLastMessageReasoning,
      markReasoningComplete,
      getConversationById,
      stopStreaming,
      metadata: sendMetadata,
      onError: (error) => {
        handleStreamingError({
          error,
          providerName: providerInfo.name,
          errorHandlers: { showFetchErrorAlert, showInvalidApiKeyAlert, showMissingApiKeyAlert },
          onOpenSettings
        })
      }
    })

    try {
      await sendStreamingMessage({
        providerId: currentProvider,
        providerConfig: null,
        apiKey,
        model: currentModel,
        messages: messagesForApi,
        ...streamingCallbacks,
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected error:', error)
      stopStreaming(targetConversationId)
    }
  }

  const handleStopGeneration = () => {
    if (isConversationStreaming(currentConversationId)) {
      stopStreaming(currentConversationId)
    }
  }

  const handleRetry = async (assistantMessage) => {
    if (isConversationStreaming(currentConversationId)) return

    const freshMessages = getCurrentConversation()?.messages || []

    const messageIndex = freshMessages.findIndex(m => m.id === assistantMessage.id)
    if (messageIndex <= 0) return

    const userMessage = freshMessages[messageIndex - 1]
    if (userMessage.role !== 'user') return

    const apiKey = apiKeys[currentProvider]
    if (!apiKey) {
      showMissingApiKeyAlert(providerInfo.name, () => {
        if (onOpenSettings) onOpenSettings()
      })
      return
    }

    const messagesForApi = await formatMessagesForAPI(freshMessages.slice(0, messageIndex))

    const clearMetadata = {
      timestamp: new Date().toISOString(),
      model: currentModel,
      provider: currentProvider,
      reasoning: '',
      isReasoningComplete: false
    }
    updateLastMessage('', false, clearMetadata)

    const retryConversationId = currentConversationId
    const abortSignal = startStreaming(retryConversationId)

    const streamingMetadata = {
      timestamp: new Date().toISOString(),
      model: currentModel,
      provider: currentProvider
    }

    const streamingCallbacks = createStreamingCallbacks({
      conversationId: retryConversationId,
      updateLastMessage,
      updateLastMessageReasoning,
      markReasoningComplete,
      getConversationById,
      stopStreaming,
      metadata: streamingMetadata,
      onError: (error) => {
        handleStreamingError({
          error,
          providerName: providerInfo.name,
          errorHandlers: { showFetchErrorAlert, showInvalidApiKeyAlert, showMissingApiKeyAlert },
          onOpenSettings
        })
      }
    })

    try {
      await sendStreamingMessage({
        providerId: currentProvider,
        providerConfig: null,
        apiKey,
        model: currentModel,
        messages: messagesForApi,
        ...streamingCallbacks,
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected retry error:', error)
      stopStreaming(retryConversationId)
    }
  }

  const handleEditUserMessage = async (userMessage, newContent) => {
    if (isConversationStreaming(currentConversationId)) return

    const editConversationId = currentConversationId
    const freshMessages = getCurrentConversation()?.messages || []

    const messageIndex = freshMessages.findIndex(m => m.id === userMessage.id)
    if (messageIndex < 0) return

    const apiKey = apiKeys[currentProvider]
    if (!apiKey) {
      showMissingApiKeyAlert(providerInfo.name, () => {
        if (onOpenSettings) onOpenSettings()
      })
      return
    }

    let messagesForApi
    try {
      const updatedMessages = [...freshMessages]
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
        timestamp: new Date().toISOString()
      }

      const messagesUpToEdit = updatedMessages.slice(0, messageIndex + 1)
      await replaceMessages(messagesUpToEdit)
      messagesForApi = await formatMessagesForAPI(messagesUpToEdit)

      await addMessage({
        role: 'assistant',
        content: '',
        reasoning: '',
        isReasoningComplete: false,
        model: currentModel,
        provider: currentProvider
      }, editConversationId)
    } catch (error) {
      console.error('Error editing message:', error)
      showFetchErrorAlert(providerInfo.name, 'Failed to edit message. Please try again.')
      return
    }

    const abortSignal = startStreaming(editConversationId)

    const editMetadata = {
      timestamp: new Date().toISOString(),
      model: currentModel,
      provider: currentProvider
    }

    const streamingCallbacks = createStreamingCallbacks({
      conversationId: editConversationId,
      updateLastMessage,
      updateLastMessageReasoning,
      markReasoningComplete,
      getConversationById,
      stopStreaming,
      metadata: editMetadata,
      onError: (error) => {
        handleStreamingError({
          error,
          providerName: providerInfo.name,
          errorHandlers: { showFetchErrorAlert, showInvalidApiKeyAlert, showMissingApiKeyAlert },
          onOpenSettings
        })
      }
    })

    try {
      await sendStreamingMessage({
        providerId: currentProvider,
        providerConfig: null,
        apiKey,
        model: currentModel,
        messages: messagesForApi,
        ...streamingCallbacks,
        abortSignal,
      })
    } catch (error) {
      console.error('Unexpected edit error:', error)
      stopStreaming(editConversationId)
    }
  }

  // Loading skeleton
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
        isStreaming={isConversationStreaming(currentConversationId)}
        onStopGeneration={handleStopGeneration}
      />
    </div>
  )
}

export default ChatWindow
