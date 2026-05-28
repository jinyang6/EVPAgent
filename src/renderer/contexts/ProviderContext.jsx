import { createContext, useContext, useState, useEffect } from 'react'
import { isElectron, isEncryptionAvailable } from '@/platform/ElectronBridge'
import { secureStore as store } from '@/data/SecureStore'

const ProviderContext = createContext(null)

const useElectronStorage = isElectron()

export function ProviderProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true)
  const [encryptionStatus, setEncryptionStatus] = useState(null)

  // Always evpagent / probe — no provider switching
  const [provider] = useState('evpagent')
  const [model] = useState('probe')
  const [apiKeys, setApiKeys] = useState({ evpagent: '' })

  // Initialize from storage on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (useElectronStorage) {
          try {
            const encStatus = await isEncryptionAvailable()
            setEncryptionStatus(encStatus)
            if (!encStatus.available) {
              console.error('⚠️ WARNING: Encryption not available!')
            }
          } catch (error) {
            console.error('Could not check encryption status:', error)
          }
        }

        if (useElectronStorage) {
          const apiKeysResult = await store.get('apiKeys')
          if (apiKeysResult.success && apiKeysResult.value) {
            setApiKeys(prev => ({ ...prev, ...apiKeysResult.value }))
          }
        } else {
          const savedApiKeys = localStorage.getItem('apiKeys')
          if (savedApiKeys) {
            try {
              const loadedKeys = JSON.parse(savedApiKeys)
              setApiKeys(prev => ({ ...prev, ...loadedKeys }))
            } catch (e) {
              console.error('Failed to parse stored API keys:', e)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load initial data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Fetched models state
  const [fetchedModels, setFetchedModels] = useState(() => {
    const stored = localStorage.getItem('fetchedModels')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to parse fetched models:', e)
      }
    }
    return {}
  })

  // Models fetch status
  const [modelsFetchStatus, setModelsFetchStatus] = useState({})

  // Persist API keys
  useEffect(() => {
    if (isLoading) return

    const saveApiKeys = async () => {
      try {
        const cleanedKeys = { evpagent: apiKeys.evpagent || '' }

        if (useElectronStorage) {
          await store.set('apiKeys', cleanedKeys)
        } else {
          localStorage.setItem('apiKeys', JSON.stringify(cleanedKeys))
        }
      } catch (error) {
        console.error('Failed to save API keys:', error)
      }
    }
    saveApiKeys()
  }, [apiKeys, isLoading])

  useEffect(() => {
    localStorage.setItem('fetchedModels', JSON.stringify(fetchedModels))
  }, [fetchedModels])

  const updateApiKey = (providerId, key) => {
    setApiKeys(prev => ({ ...prev, [providerId]: key }))
  }

  const getModelsForProvider = (providerId) => {
    const cached = fetchedModels[providerId]
    if (cached && cached.models && cached.lastFetched) {
      const age = Date.now() - cached.lastFetched
      if (age <= 24 * 60 * 60 * 1000) {
        return cached.models
      }
    }
    return []
  }

  const setModelsFetchLoading = (providerId, loading) => {
    setModelsFetchStatus(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], loading }
    }))
  }

  const setModelsFetchError = (providerId, error, errorType = 'OTHER_ERROR') => {
    setModelsFetchStatus(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], loading: false, error, errorType }
    }))
  }

  const updateFetchedModels = (providerId, models) => {
    setFetchedModels(prev => ({
      ...prev,
      [providerId]: { models, lastFetched: Date.now(), error: null }
    }))
    setModelsFetchStatus(prev => ({
      ...prev,
      [providerId]: { loading: false, error: null }
    }))
  }

  const value = {
    provider,
    model,
    apiKeys,
    setApiKeys,
    updateApiKey,
    fetchedModels,
    modelsFetchStatus,
    isLoading,
    encryptionStatus,
    getModelsForProvider,
    setModelsFetchLoading,
    setModelsFetchError,
    updateFetchedModels,
  }

  return (
    <ProviderContext.Provider value={value}>
      {children}
    </ProviderContext.Provider>
  )
}

export function useProvider() {
  const context = useContext(ProviderContext)
  if (!context) {
    throw new Error('useProvider must be used within a ProviderProvider')
  }
  return context
}
