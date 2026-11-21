import { useEffect, useRef, useState } from 'react'

const API_URL = '/api/query'

const AI_AVATAR = '🤖'
const USER_AVATAR = '👤'

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function StatusExpander({ loading, steps }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!loading) setOpen(false)
  }, [loading])

  return (
    <div className="st-status">
      <button type="button" className="st-status-header" onClick={() => setOpen(!open)}>
        <span className="chevron">{open ? '▾' : '▸'}</span>
        {loading ? '🔍 Agent is thinking...' : '✅ Answer Synthesized'}
      </button>
      {open && (
        <div className="st-status-body">
          {steps.map((step, i) => (
            <div key={i}>⚙️ {step}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function SourcesExpander({ sources }) {
  if (!sources || sources.length === 0) {
    return <div className="st-caption">ℹ️ No context retrieved — conversational response.</div>
  }
  return (
    <details className="st-expander">
      <summary>📄 Retrieved Context ({sources.length} chunks)</summary>
      <div className="st-expander-body">
        {sources.map((source, i) => {
          const preview = String(source).replace(/\n/g, ' ').slice(0, 100) + '...'
          return (
            <details className="st-expander nested" key={i}>
              <summary>Chunk {i + 1}: {preview}</summary>
              <div className="st-info">{source}</div>
            </details>
          )
        })}
      </div>
    </details>
  )
}

function ChatMessage({ message }) {
  return (
    <div className="st-chat-message">
      <div className="st-avatar">{message.role === 'assistant' ? AI_AVATAR : USER_AVATAR}</div>
      <div className="st-chat-content">
        <div className="st-chat-role">{message.role === 'assistant' ? 'assistant' : 'user'}</div>
        <div className="st-markdown">{message.content}</div>
        {message.steps && message.steps.length > 0 && (
          <StatusExpander steps={message.steps} />
        )}
        {message.sources && <SourcesExpander sources={message.sources} />}
      </div>
    </div>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('rag-session-id')
    if (saved) return saved
    const id = newSessionId()
    localStorage.setItem('rag-session-id', id)
    return id
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingSteps, setPendingSteps] = useState([])
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, pendingSteps])

  async function handleSubmit(event) {
    event.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setError('')
    setPendingSteps([])
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: question, thread_id: sessionId }),
      })
      if (!response.ok) throw new Error(`Backend Error: ${response.status} - ${await response.text()}`)

      const data = await response.json()
      const steps = Array.isArray(data.thought_process) ? data.thought_process : []
      const sources = Array.isArray(data.sources) ? data.sources : []
      const answer = data.answer || 'No response.'

      setPendingSteps(steps)

      // Typewriter effect — reveal the answer over ~1.5s regardless of length
      const placeholderIndex = messages.length + 1
      setMessages((prev) => [...prev, { role: 'assistant', content: '', steps, sources }])
      const stepMs = Math.max(2, Math.min(12, Math.floor(1500 / answer.length)))
      let i = 0
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          i += 5
          const chunk = answer.slice(0, i) + (i < answer.length ? '▌' : '')
          setMessages((prev) => {
            const copy = [...prev]
            copy[placeholderIndex] = { ...copy[placeholderIndex], content: chunk }
            return copy
          })
          if (i >= answer.length) {
            clearInterval(timer)
            setMessages((prev) => {
              const copy = [...prev]
              copy[placeholderIndex] = { ...copy[placeholderIndex], content: answer }
              return copy
            })
            resolve()
          }
        }, stepMs)
      })
      setPendingSteps([])
    } catch (err) {
      setError(err.message || 'Backend Offline.')
    } finally {
      setLoading(false)
    }
  }

  function clearHistory() {
    const id = newSessionId()
    setSessionId(id)
    localStorage.setItem('rag-session-id', id)
    setMessages([])
    setPendingSteps([])
    setError('')
  }

  return (
    <div className="st-app">
      <aside className="st-sidebar">
        <h1 className="st-sidebar-title">🧠 Agent OS</h1>
        <hr className="st-divider" />
        <div className="st-success">Logfire: Connected &amp; Tracing</div>
        <div className="st-info-box">Memory ID: {sessionId.slice(0, 8)}</div>
        <button type="button" className="st-primary-button" onClick={clearHistory}>
          🗑️ Clear History &amp; Memory
        </button>
      </aside>

      <main className="st-main">
        <h1 className="st-title">🤖 Enterprise Agentic Assistant</h1>

        <div className="st-chat-area">
          {messages.length === 0 && !loading && (
            <div className="st-empty">Ask about your documentation...</div>
          )}

          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}

          {loading && (
            <div className="st-chat-message">
              <div className="st-avatar">{AI_AVATAR}</div>
              <div className="st-chat-content">
                <div className="st-chat-role">assistant</div>
                <StatusExpander loading steps={pendingSteps} />
              </div>
            </div>
          )}

          {error && <div className="st-error">{error}</div>}
          <div ref={endRef} />
        </div>

        <form className="st-composer" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your documentation..."
            aria-label="Question"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>Send</button>
        </form>
      </main>
    </div>
  )
}
