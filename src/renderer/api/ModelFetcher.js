// Model fetcher service entry point
import { fetchCustomProviderModels } from './providers/custom/modelFetcher'
import { getProviderById } from '@/config/providers'

/**
 * Main fetch function - routes to appropriate provider fetcher
 */
export async function fetchModelsForProvider(providerId, apiKey, customProviderConfig = null) {
  if (!apiKey) {
    // Allow providers that don't require API keys
    const provider = getProviderById(providerId)
    if (provider && !provider.requiresApiKey) {
      // Use provider's own config
      return await fetchCustomProviderModels({
        apiBaseUrl: provider.apiBaseUrl,
        modelsEndpoint: provider.modelsEndpoint,
        authHeaderKey: provider.authHeaderKey,
        authHeaderValue: provider.authHeaderValue.replace('{key}', apiKey || ''),
      }, apiKey || '')
    }
    throw new Error('API key is required')
  }

  // Custom provider or built-in OpenAI-compatible provider (e.g., evpagent)
  if (customProviderConfig) {
    return await fetchCustomProviderModels(customProviderConfig, apiKey)
  }
  const builtIn = getProviderById(providerId)
  if (builtIn && builtIn.supportsDynamicFetch) {
    return await fetchCustomProviderModels({
      apiBaseUrl: builtIn.apiBaseUrl,
      modelsEndpoint: builtIn.modelsEndpoint,
      authHeaderKey: builtIn.authHeaderKey,
      authHeaderValue: builtIn.authHeaderValue.replace('{key}', apiKey),
    }, apiKey)
  }
  throw new Error(`Unknown provider: ${providerId}`)
}
