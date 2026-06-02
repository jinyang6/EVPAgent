import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Key as KeyIcon, ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { EncryptionBadge } from './settings/EncryptionBadge'
import { useProvider } from '@/contexts/ProviderContext'
import { useError } from '@/contexts/ErrorContext'
import { openExternal } from '@/platform/ElectronBridge'

function SettingsModal({ onClose }) {
  const { apiKeys, setApiKeys, encryptionStatus } = useProvider()
  const { showSuccess } = useError()

  const handleSave = () => {
    showSuccess('Settings Saved', 'Your API key has been saved.')
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <KeyIcon className="h-5 w-5" />
            <DialogTitle>API Configuration</DialogTitle>
          </div>
          <DialogDescription>
            Enter your OpenRouter API key to enable EVPAgent research capabilities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="api-key">OpenRouter API Key</Label>
              <EncryptionBadge encryptionStatus={encryptionStatus} />
            </div>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKeys.evpagent || ''}
              onChange={(e) => setApiKeys({ ...apiKeys, evpagent: e.target.value })}
              className="font-mono"
            />
          </div>

          {/* Get API Key Link */}
          <div
            onClick={() => openExternal('https://openrouter.ai/keys')}
            className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            Get your API key from OpenRouter
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsModal
