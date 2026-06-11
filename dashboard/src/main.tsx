import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* App-wide toast notifications. Without this mount, every toast.*() call
          across the dashboard rendered nothing — errors/success were invisible. */}
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
    </QueryClientProvider>
  </React.StrictMode>,
)
