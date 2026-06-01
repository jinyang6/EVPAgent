import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { setApiPort } from '@/config/providers'

// Wait for the API port from Electron main process before rendering.
// Falls back to default (3456) if not running inside Electron or IPC fails.
async function init() {
  if (window.electronAPI?.getApiPort) {
    try {
      const port = await window.electronAPI.getApiPort()
      if (port) {
        setApiPort(port)
        console.log('[renderer] API port set to', port)
      }
    } catch (e) {
      console.warn('[renderer] Failed to get API port, using default:', e.message)
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />,
  )
}

init()
