import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ProviderProvider, useProvider } from './contexts/ProviderContext'
import { ConversationProvider, useConversation } from './contexts/ConversationContext'
import { ErrorProvider } from './contexts/ErrorContext'
import { UpdateProvider } from './contexts/UpdateContext'
import TitleBar from './components/TitleBar'
import ProviderModelBar from './components/ProviderModelBar'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import SettingsModal from './components/SettingsModal'
import { isElectron, signalAppReady } from '@/platform/ElectronBridge'

// Inner component that signals app ready when both contexts are loaded
function AppReadySignal() {
  const { isLoading: providerLoading } = useProvider()
  const { isLoading: conversationLoading } = useConversation()

  useEffect(() => {
    // Signal app ready when both contexts have finished loading
    if (!providerLoading && !conversationLoading) {
      signalAppReady()
    }
  }, [providerLoading, conversationLoading])

  return null
}

function App() {
  const [currentConversation, setCurrentConversation] = useState('conv-1')
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dataInfo, setDataInfo] = useState(null)

  const loadDataInfo = async () => {
    if (!isElectron()) return
    try {
      const info = await window.electronAPI.data.getInfo()
      setDataInfo(info)
    } catch (err) {
      console.error('Failed to load data info:', err)
    }
  }

  const handleOpenSettings = async () => {
    await loadDataInfo()
    setShowSettings(true)
  }

  // Log startup mode
  useEffect(() => {
    const electronMode = isElectron()
    console.log('=== EVPAgent Startup ===')
    console.log('Running in:', electronMode ? 'ELECTRON MODE (file system)' : 'BROWSER MODE (localStorage)')
    if (!electronMode) {
      console.log('⚠️ Browser mode: Conversations are stored in localStorage, not JSON files on disk')
      console.log('To use file storage, run: npm start (which launches Electron)')
    }
    console.log('========================')
  }, [])

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebarOpen')
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved))
    }
  }, [])

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen))
  }, [sidebarOpen])

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar (VS Code standard)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ErrorProvider>
      <UpdateProvider>
        <ProviderProvider>
          <ConversationProvider>
            {/* Signal Electron to show window when app is ready */}
            <AppReadySignal />

            <div className="flex flex-col h-screen bg-background overflow-hidden">
              {/* Custom Title Bar (Electron only) */}
              <TitleBar />

              {/* Main Content Area - Sidebar + Provider Bar share same top border (reverse L) */}
              <div className="relative flex flex-1 overflow-hidden">
                {/* Collapsible Sidebar */}
                <Sidebar
                  isOpen={sidebarOpen}
                  onSelectConversation={setCurrentConversation}
                  onOpenSettings={handleOpenSettings}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen(prev => !prev)}
                />

                {/* Right side: ProviderModelBar + ChatWindow */}
                <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
                  {/* Top bar — update button appears here when available */}
                  <ProviderModelBar />

                  {/* Main Chat Area */}
                  <ChatWindow
                    conversationId={currentConversation}
                    onOpenSettings={handleOpenSettings}
                  />
                </div>

                {/* Settings Modal */}
                {showSettings && (
                  <SettingsModal
                    onClose={() => setShowSettings(false)}
                    dataInfo={dataInfo}
                    onRefreshDataInfo={loadDataInfo}
                  />
                )}
              </div>
            </div>

            {/* Toast Notifications */}
            <Toaster richColors position="bottom-right" swipeDirections={['right']} />
          </ConversationProvider>
        </ProviderProvider>
      </UpdateProvider>
    </ErrorProvider>
  )
}

export default App
