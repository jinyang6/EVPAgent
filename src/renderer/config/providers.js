export const PROVIDERS = [
  {
    id: 'evpagent',
    name: 'EVPAgent',
    description: 'Wikipedia research agent with multi-turn conversation and deep research capabilities.',
    badge: 'Default',
    badgeVariant: 'default',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiBaseUrl: 'http://localhost:3456/v1',
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    testEndpoint: '/health',
    authHeaderKey: 'Authorization',
    authHeaderValue: 'Bearer {key}',
    extraHeaders: {},
    supportsDynamicFetch: true,
    requiresApiKey: false,
    hidden: false,
    fallbackModels: [
      {
        id: 'probe',
        name: 'Probe',
        contextWindow: '128k',
        description: 'General-purpose research agent supporting multi-turn conversation and Wikipedia deep-dive.'
      }
    ]
  }
]


export function getProviderById(providerId) {
  return PROVIDERS.find(p => p.id === providerId)
}

export function getModelById(providerId, modelId) {
  const provider = getProviderById(providerId)
  if (!provider) return null

  // Check static models first
  if (provider.models) {
    return provider.models.find(m => m.id === modelId)
  }

  // Check fallback models
  if (provider.fallbackModels) {
    return provider.fallbackModels.find(m => m.id === modelId)
  }

  return null
}

export function getAllModels(providerId) {
  const provider = getProviderById(providerId)
  if (!provider) return []

  // Return static models if available
  if (provider.models) {
    return provider.models
  }

  // Return fallback models
  return provider.fallbackModels || []
}

export function getFallbackModels(providerId) {
  const provider = getProviderById(providerId)
  if (!provider) return []

  if (provider.models) return provider.models
  return provider.fallbackModels || []
}
