import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Check, Loader2, ArrowLeft } from 'lucide-react';
import { apiRequest } from '@/lib/api';

type ChatMessage = {
  sender: 'visitor' | 'business';
  content: string;
  timestamp: string;
};

const TOKEN_KEY = 'masters_chat_token';
const POLL_INTERVAL = 8000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [emailWarning, setEmailWarning] = useState('');
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polling, setPolling] = useState(false);
  const [closed, setClosed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      void loadMessages(saved);
    }
  }, []);

  useEffect(() => {
    if (token && open) {
      void loadMessages(token);
      pollTimer.current = setInterval(() => {
        if (!sending) void loadMessages(token);
      }, POLL_INTERVAL);
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [token, open, sending]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages(convToken: string) {
    setPolling(true);
    try {
      const data = await apiRequest<{ messages?: ChatMessage[]; isClosed?: boolean }>('/chat/retrieve', {
        method: 'POST',
        body: JSON.stringify({ visitor_token: convToken }),
      });
      if (data.messages) {
        setMessages(data.messages);
        setClosed(data.isClosed ?? false);
        setError('');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this conversation.');
    } finally {
      setPolling(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setEmailWarning('');
    setSending(true);

    try {
      const data = await apiRequest<{ conversationRef: string; emailDelivered: boolean }>('/chat/submit', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          message,
          visitor_token: token,
          company_website: honeypot,
        }),
      });

      if (data.conversationRef && data.conversationRef !== 'demo') {
        localStorage.setItem(TOKEN_KEY, data.conversationRef);
        setToken(data.conversationRef);
      }

      setMessages((prev) => [...prev, { sender: 'visitor', content: message, timestamp: new Date().toISOString() }]);
      setMessage('');
      if (data.emailDelivered) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setEmailWarning('Your message was saved, but email notifications are not configured. You can continue here.');
      }
      void loadMessages(data.conversationRef);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  const hasConversation = token && messages.length > 0;

  return (
    <>
      <button
        className={`chat-fab${open ? ' is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Chat with us"
      >
        <MessageSquare size={22} strokeWidth={1.5} />
        <span className="chat-fab-label">Chat With Us</span>
        <span className="chat-fab-pulse" />
      </button>

      {open && (
        <div className="chat-window" role="dialog" aria-modal="false" aria-label="Chat with Masters Real Estate">
          <div className="chat-header">
            <div className="chat-header-info">
              {hasConversation && (
                <button className="chat-back" onClick={() => { setOpen(false); }} aria-label="Close chat">
                  <ArrowLeft size={16} />
                </button>
              )}
              <div className="chat-avatar"><MessageSquare size={18} strokeWidth={1.5} /></div>
              <div>
                <strong>Masters Real Estate</strong>
                <span className="chat-status">
                  <span className="chat-status-dot" />
                  {polling ? 'Checking for replies…' : 'Online · We typically reply within hours'}
                </span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          {hasConversation ? (
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.sender === 'visitor' ? 'is-visitor' : 'is-business'}`}>
                  {msg.sender === 'business' && <span className="chat-bubble-author">Masters Real Estate</span>}
                  <p>{msg.content}</p>
                  <span className="chat-bubble-time">{timeAgo(msg.timestamp)}</span>
                </div>
              ))}
              {closed && (
                <div className="chat-closed-notice">This conversation is closed. Send a message to reopen it.</div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="chat-intro">
              <p className="chat-intro-greeting">Welcome to Masters Real Estate.</p>
              <p className="chat-intro-text">
                Have a question about a property or want to schedule a viewing? Share your details below
                and we'll get back to you — your conversation is private and secure.
              </p>
            </div>
          )}

          {success && (
            <div className="chat-inline-notice">
              <Check size={15} /> Message sent — we'll reply as soon as possible.
            </div>
          )}

          {error && (
            <div className="chat-inline-error">{error}</div>
          )}
          {emailWarning && <div className="chat-inline-error">{emailWarning}</div>}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            {!token && (
              <div className="chat-fields">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </div>
            )}
            <div className="chat-input-row">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={hasConversation ? 'Type your reply…' : 'Type your message…'}
                required
                minLength={5}
                maxLength={2000}
              />
              <button type="submit" disabled={sending || !message.trim()} aria-label="Send message">
                {sending ? <Loader2 size={18} className="chat-spin" /> : <Send size={18} />}
              </button>
            </div>
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="chat-honeypot"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
          </form>
        </div>
      )}
    </>
  );
}
