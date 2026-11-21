import { useEffect, useRef, useState } from 'react'

const API_URL = '/api/query'

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const [steps, setSteps] = useState([])
  const [sources, setSources] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, steps])

  async function handleSubmit(event) {
    event.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setError('')
    setSteps([])
    setSources([])
    setStatus('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: question, thread_id: sessionId }),
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)

      const data = await response.json()
      setSteps(Array.isArray(data.thought_process) ? data.thought_process : [])
      setSources(Array.isArray(data.sources) ? data.sources : [])
      setStatus(data.status || '')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer || 'No response.' },
      ])
    } catch (err) {
      setError(err.message || 'Backend Offline.')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Backend Offline. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function newChat() {
    const id = newSessionId()
    setSessionId(id)
    localStorage.setItem('rag-session-id', id)
    setMessages([])
    setSteps([])
    setSources([])
    setStatus('')
    setError('')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">🧠 Agent OS</div>
        <div className="divider" />
        <div className="side-label">Conversation memory</div>
        <div className="badge">ID: {sessionId.slice(0, 8)}</div>
        <button type="button" className="secondary-button" onClick={newChat}>
          🗑️ New chat
        </button>
        <div className="side-note">
          Retrieval, guardrails and reasoning are logged to Logfire and LangSmith.
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <h1>🤖 Enterprise Agentic Assistant</h1>
          <p>Ask about your technical documentation.</p>
        </header>

        <section className="chat" aria-live="polite">
          {messages.length === 0 && !loading && (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div>Ask about Kubernetes, Intel hardware or enterprise networking.</div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="avatar">
                {message.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div className="bubble">{message.content}</div>
            </div>
          ))}

          {loading && (
            <div className="message assistant">
              <div className="avatar">🤖</div>
              <div className="bubble thinking">
                <span className="spinner" /> Agent is thinking…
              </div>
            </div>
          )}

          {!loading && steps.length > 0 && (
            <div className="panel">
              <div className="panel-title">⚙️ Reasoning steps</div>
              <ol>
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {!loading && status && (
            <div className="status-line">Status: {status}</div>
          )}

          {!loading && sources.length > 0 && (
            <details className="panel sources" open>
              <summary>📄 Retrieved context ({sources.length} chunks)</summary>
              {sources.map((source, index) => (
                <details key={index} className="source">
                  <summary>Chunk {index + 1}: {String(source).slice(0, 90)}…</summary>
                  <pre>{source}</pre>
                </details>
              ))}
            </details>
          )}

          {error && <div className="error">{error}</div>}
          <div ref={endRef} />
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your documentation..."
            aria-label="Question"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? '…' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  )
}
