import { ConversationRepository as conversationStorage } from '@/data/ConversationRepository'
import { ConversationManager as conversationManager } from '@/core/chat/ConversationManager'

/**
 * Hook for loading and initializing the list.
 */
export function useConversationList(setConversations, setCurrentConversationId, setIsLoading, initializedRef) {

  // Create a single fresh conversation and make it the entire list.
  // Used directly (not via createNewConversation) so the list is *replaced*,
  // not prepended to — avoids resurrecting stale conversations on reload.
  const startFresh = async () => {
    const newConv = conversationManager.createNewObject()
    try {
      await conversationStorage.save(newConv)
    } catch (e) {
      console.error('New conversation save error:', e)
    }
    setConversations([newConv])
    setCurrentConversationId(newConv.id)
  }

  const loadConversations = async () => {
    if (initializedRef.current) return
    initializedRef.current = true

    try {
      const result = await conversationStorage.list()
      if (result.success && result.conversations.length > 0) {
        const sorted = conversationManager.sortByRecent(result.conversations)
        setConversations(sorted)
        setCurrentConversationId(sorted[0].id)
      } else {
        await startFresh()
      }
    } catch (error) {
      console.error('List load error:', error)
      await startFresh()
    } finally {
      setIsLoading(false)
    }
  }

  return { loadConversations }
}
