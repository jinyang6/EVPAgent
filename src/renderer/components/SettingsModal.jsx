import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Key as KeyIcon } from 'lucide-react'
import { ApiKeysTab } from './settings/ApiKeysTab'
import { useProvider } from '@/contexts/ProviderContext'
import { useModelFetcher } from '@/hooks/useModelFetcher'
import { useError } from '@/contexts/ErrorContext'
import { testApiConnection, validateBeforeTest } from '@/core/chat/ApiTester'
import { openExternal } from '@/platform/ElectronBridge'

function SettingsModal({ onClose }) {
  const {
    apiKeys,
    setApiKeys,
    modelsFetchStatus,
    fetchedModels,
    encryptionStatus
  } = useProvider()
  const { fetchModels } = useModelFetcher()
  const { showSuccess, showError } = useError()

  const [testingConnection, setTestingConnection] = useState({})
  const [connectionTestResult, setConnectionTestResult] = useState({})
  const [connectionTestTimestamp, setConnectionTestTimestamp] = useState({})

  const handleSave = async (showNotification = true) => {
    if (showNotification) {
      showSuccess(
        'Settings Saved',
        'Your configuration has been saved successfully.'
      )
    }

    // Fetch models in background
    try {
      await fetchModels('evpagent', false)
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  const handleTestConnection = async (providerId) => {
    const apiKey = apiKeys[providerId]
    if (!apiKey) {
      showError('Cannot Test Connection', 'Please enter an API key first.')
      return
    }

    setTestingConnection({ ...testingConnection, [providerId]: true })
    setConnectionTestResult({ ...connectionTestResult, [providerId]: null })

    try {
      const result = await testApiConnection(providerId, apiKey)
      setConnectionTestResult({ ...connectionTestResult, [providerId]: result })
      if (result.success) {
        setConnectionTestTimestamp({ ...connectionTestTimestamp, [providerId]: Date.now() })
      } else {
        showError(result.title, result.message, result.details)
      }
    } catch (error) {
      const errorResult = { success: false, message: 'Test failed', details: error.message }
      setConnectionTestResult({ ...connectionTestResult, [providerId]: errorResult })
      showError('Test Failed', 'Could not test API connection.', error.message)
    } finally {
      setTestingConnection({ ...testingConnection, [providerId]: false })
    }
  }

  const handleFetchModels = async (providerId) => {
    try {
      await fetchModels(providerId, true)
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => {
      if (!open) {
        handleSave(false)
        onClose()
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <KeyIcon className="h-5 w-5" />
            <DialogTitle>API Configuration</DialogTitle>
          </div>
          <DialogDescription>
            Configure your API key to start chatting with EVPAgent.
          </DialogDescription>
        </DialogHeader>

        <ApiKeysTab
          apiKeys={apiKeys}
          setApiKeys={setApiKeys}
          encryptionStatus={encryptionStatus}
          testingConnection={testingConnection}
          connectionTestResult={connectionTestResult}
          connectionTestTimestamp={connectionTestTimestamp}
          onTestConnection={handleTestConnection}
          fetchedModels={fetchedModels}
          modelsFetchStatus={modelsFetchStatus}
          onFetchModels={handleFetchModels}
          openExternal={openExternal}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsModal
