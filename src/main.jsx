import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <main className="app-shell error-screen"><p className="eyebrow">Jarvis interface error</p><h1>The interface hit an unexpected error.</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Reload interface</button></main>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
