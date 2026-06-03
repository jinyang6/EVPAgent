import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XCircle as XCircleIcon } from 'lucide-react'
import { isElectron } from '@/platform/ElectronBridge'

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function DataCard({ name, description, metrics, path, actionLabel, helpText, onAction }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const confirmTimer = useRef(null)

  const cancelConfirm = useCallback(() => {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
    setConfirming(false)
  }, [])

  const handleClick = async () => {
    if (!confirming) {
      // First click — ask for confirmation
      setConfirming(true)
      confirmTimer.current = setTimeout(() => {
        setConfirming(false)
        confirmTimer.current = null
      }, 4000)
      return
    }

    // Second click — confirmed, execute
    cancelConfirm()
    setLoading(true)
    setError(null)
    try {
      await onAction()
    } catch (err) {
      setError(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  const isDestructive = confirming || (error && !loading)

  return (
    <div className="border rounded-lg p-5 space-y-4 bg-muted/50">
      {/* Header */}
      <div>
        <h4 className="text-base font-semibold">{name}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Metrics — big, prominent numbers */}
      {metrics && metrics.length > 0 && (
        <div className="flex gap-8">
          {metrics.map((m, i) => (
            <div key={i}>
              <div className="text-2xl font-bold tabular-nums">{m.value}</div>
              <div className="text-xs text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Path display */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Path</div>
        <code className="block w-full rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate">
          {path}
        </code>
      </div>

      {/* Action */}
      <div className="space-y-2">
        <Button
          variant={isDestructive ? 'destructive' : 'outline'}
          className="w-full"
          onClick={handleClick}
          disabled={loading}
        >
          {loading
            ? 'Working...'
            : confirming
              ? `Confirm — ${actionLabel}`
              : actionLabel}
        </Button>

        {confirming && (
          <p className="text-xs text-center text-muted-foreground">
            Click again to confirm, or wait to cancel.
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-sm flex items-start gap-2">
              <XCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {error}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Help text */}
      <p className="text-sm text-muted-foreground">{helpText}</p>
    </div>
  )
}

export function DataTab({ dataInfo, onRefresh, onClearConversations }) {
  if (!isElectron()) {
    return (
      <div className="space-y-4 mt-4">
        <Alert>
          <AlertDescription className="text-sm">
            Data management is only available in the EVPAgent desktop application.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleResetVectorDb = async () => {
    await window.electronAPI.data.resetVectorDb()
    await onRefresh()
  }

  const handleResetPrompts = async () => {
    await window.electronAPI.data.resetPrompts()
    await onRefresh()
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Fixed header */}
      <div>
        <h3 className="text-lg font-semibold">Data &amp; Memory</h3>
        <p className="text-sm text-muted-foreground">
          Manage cached research data, prompts, and saved conversations.
        </p>
      </div>

      {/* Scrollable cards */}
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          <DataCard
            name="Vector Database"
            description="Cached Wikipedia embeddings for fast search."
            metrics={[
              { value: formatBytes(dataInfo?.vectorDb?.sizeBytes ?? 0), label: 'Disk usage' }
            ]}
            path={dataInfo?.vectorDb?.path ?? 'EVPAgent\\lancedb'}
            actionLabel="Clear Vector Database"
            helpText="Clearing removes all indexed data. Subsequent searches will fetch fresh from Wikipedia and re-index."
            onAction={handleResetVectorDb}
          />

          <DataCard
            name="Prompts"
            description="Custom research strategy prompts."
            metrics={[
              { value: dataInfo?.prompts?.customCount ?? 0, label: 'Custom prompts' },
              { value: dataInfo?.prompts?.defaultCount ?? 2, label: 'Default prompts' }
            ]}
            path={dataInfo?.prompts?.path ?? 'EVPAgent\\prompts\\dynamic_prompts'}
            actionLabel="Reset Prompts to Defaults"
            helpText="The system adapts rephrasing and research from past searches. Reset if output quality degrades."
            onAction={handleResetPrompts}
          />

          <DataCard
            name="Conversations"
            description="Saved chat history."
            metrics={[
              { value: dataInfo?.conversations?.fileCount ?? 0, label: 'Files' },
              { value: formatBytes(dataInfo?.conversations?.sizeBytes ?? 0), label: 'Disk usage' }
            ]}
            path={dataInfo?.conversations?.path ?? 'EVPAgent\\conversations'}
            actionLabel="Clear All Conversations"
            helpText="Removes all past conversations permanently. This action cannot be undone."
            onAction={onClearConversations}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
