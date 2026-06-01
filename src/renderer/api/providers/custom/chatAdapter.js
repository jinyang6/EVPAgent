/**
 * OpenAI-compatible chat adapter (inlined from deleted providers/openai/)
 * Handles: EVPAgent and all custom OpenAI-compatible providers
 */

import { validateChatParams, getErrorMessageFromResponse, handleNetworkError } from '@/core/chat/utils/chatUtils'
import { getProviderById } from '@/config/providers'

export async function sendStreamingMessage({
  apiKey,
  baseUrl,
  model,
  messages,
  onChunk,
  onReasoningChunk,
  onReasoningComplete,
  onComplete,
  onError,
  abortSignal,
  modalities = null,
  reasoning = null,
  temperature = 0.7,
  maxTokens = null,
  topP = null,
  frequencyPenalty = null,
  presencePenalty = null
}) {
  let fullContent = ''
  let fullReasoning = ''
  let reasoningDone = false
  let completeCalled = false

  try {
    validateChatParams({ apiKey, model, messages })

    const requestBody = {
      model,
      messages,
      stream: true,
      temperature
    }

    if (maxTokens) requestBody.max_tokens = maxTokens
    if (topP !== null) requestBody.top_p = topP
    if (frequencyPenalty !== null) requestBody.frequency_penalty = frequencyPenalty
    if (presencePenalty !== null) requestBody.presence_penalty = presencePenalty
    if (modalities && Array.isArray(modalities)) requestBody.modalities = modalities
    if (reasoning) requestBody.reasoning = reasoning

    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('Invalid base URL')
    }

    const provider = getProviderById('evpagent')
    const response = await fetch(`${baseUrl}${provider.chatEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = getErrorMessageFromResponse(response, errorData, 'OpenAI-compatible API')
      const error = new Error(errorMessage)
      onError(error)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      if (abortSignal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine || trimmedLine.startsWith(':')) continue
        if (!trimmedLine.startsWith('data: ')) continue

        const data = trimmedLine.substring(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)

          // Check for SSE-embedded error (mid-stream agent failures)
          if (parsed.error) {
            const err = new Error(parsed.error.message || 'Agent error')
            if (parsed.error.type) err.type = parsed.error.type
            if (parsed.error.code) err.code = parsed.error.code
            onError(err)
            return // stop processing this response
          }

          const delta = parsed.choices?.[0]?.delta

          let reasoningText = null
          if (delta?.reasoning) {
            reasoningText = delta.reasoning
          } else if (delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
            const reasoningParts = delta.reasoning_details
              .filter(part => part.type === 'reasoning.text' && part.text)
              .map(part => part.text)
            if (reasoningParts.length > 0) reasoningText = reasoningParts.join('')
          }

          if (reasoningText && onReasoningChunk) {
            fullReasoning += reasoningText
            onReasoningChunk(reasoningText, fullReasoning)
          }

          if (delta?.content && fullReasoning && !reasoningDone && onReasoningComplete) {
            onReasoningComplete()
            reasoningDone = true
          }

          if (delta?.content) {
            fullContent += delta.content
            onChunk(delta.content, fullContent)
          }

          if (Array.isArray(delta?.content)) {
            for (const part of delta.content) {
              if (part.type === 'image_url' && part.image_url?.url) {
                const md = `\n![Generated Image](${part.image_url.url})\n`
                fullContent += md
                onChunk(md, fullContent)
              }
            }
          }

          if (delta?.images && Array.isArray(delta.images)) {
            for (const image of delta.images) {
              const imageUrl = image.image_url?.url || image.url
              if (imageUrl) {
                const marker = `\n[GENERATED_IMAGE:${imageUrl}:END_IMAGE]\n`
                fullContent += marker
                onChunk(marker, fullContent)
              }
            }
          }

          const message = parsed.choices?.[0]?.message
          if (message?.images && Array.isArray(message.images)) {
            for (const image of message.images) {
              const imageUrl = image.image_url?.url || image.url
              if (imageUrl) {
                const marker = `\n[GENERATED_IMAGE:${imageUrl}:END_IMAGE]\n`
                fullContent += marker
                onChunk(marker, fullContent)
              }
            }
          }

          if (parsed.choices?.[0]?.finish_reason) break
        } catch (_) {
          // Skip malformed SSE chunks
        }
      }

      if (abortSignal?.aborted) break
    }

    if (fullReasoning && !reasoningDone && onReasoningComplete) {
      onReasoningComplete()
    }

    if (!completeCalled) {
      completeCalled = true
      onComplete(fullContent)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (fullReasoning.length > 0 && !reasoningDone) {
        if (onReasoningChunk) onReasoningChunk('', fullReasoning)
        if (onReasoningComplete) onReasoningComplete()
      }
      if (!completeCalled) {
        completeCalled = true
        onComplete(fullContent)
      }
      return
    }

    const errorMessage = handleNetworkError(error, 'OpenAI-compatible API')
    onError(new Error(errorMessage))
  }
}

export default { sendStreamingMessage }
