let _apiPort = 3456

export function setApiPort(port) {
  _apiPort = port
}

export const PROVIDERS = [
  {
    id: 'evpagent',
    name: 'OpenRouter',
    description: 'OpenRouter API key for access to frontier LLM models.',
    apiKeyUrl: 'https://openrouter.ai/keys',
    get apiBaseUrl() { return `http://localhost:${_apiPort}/v1` },
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
