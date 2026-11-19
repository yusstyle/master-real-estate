import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Mail, Clock, CheckCheck, X, Inbox } from 'lucide-react';
import { apiRequest } from '@/lib/api';

type Conversation = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
  last_business_reply_at: string | null;
};

type AdminMessage = {
  id: string;
  sender: 'visitor' | 'business';
  content: string;
  created_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ChatAdmin() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyError, setReplyError] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<Conversation[]>('/admin/conversations');
      setConversations(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load conversations.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(convId: string) {
    try {
      const data = await apiRequest<AdminMessage[]>(`/admin/conversations/${convId}/messages`);
      setMessages(data);
      setReplyError('');
    } catch (loadError) {
      setReplyError(loadError instanceof Error ? loadError.message : 'Could not load messages.');
    }
  }

  async function handleReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    setReplyError('');
    setEmailStatus('idle');

    try {
      const data = await apiRequest<{ emailDelivered: boolean }>(`/admin/conversations/${selected.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ conversation_id: selected.id, content: reply }),
      });

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        sender: 'business',
        content: reply,
        created_at: new Date().toISOString(),
      }]);
      setReply('');
      setEmailStatus(data.emailDelivered ? 'sent' : 'failed');
      setTimeout(() => setEmailStatus('idle'), 5000);
      void loadConversations();
    } catch (replyFailure) {
      setReplyError(replyFailure instanceof Error ? replyFailure.message : 'Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function closeConversation() {
    if (!selected) return;
    try {
      await apiRequest(`/admin/conversations/${selected.id}/close`, { method: 'PATCH' });
      setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, is_closed: true } : c));
    } catch (closeError) {
      setReplyError(closeError instanceof Error ? closeError.message : 'Could not close the conversation.');
    }
  }

  const hasReplied = (conv: Conversation) => conv.last_business_reply_at !== null;

  return (
    <div className="chat-admin">
      <div className="chat-admin-list">
        <div className="chat-admin-list-header">
          <div>
            <p className="eyebrow">Customer enquiries</p>
            <h3>Conversations</h3>
          </div>
          <Inbox size={20} />
        </div>

        {loading ? (
          <div className="chat-admin-empty"><Loader2 size={20} className="chat-spin" /> Loading…</div>
        ) : error ? (
          <div className="chat-admin-empty">{error}</div>
        ) : conversations.length === 0 ? (
          <div className="chat-admin-empty">
            <MessageSquare size={22} />
            <p>No customer enquiries yet.</p>
            <small>When a visitor sends a chat message, it will appear here.</small>
          </div>
        ) : (
          <div className="chat-admin-items">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                className={`chat-admin-item${selectedId === conv.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(conv.id)}
              >
                <div className="chat-admin-item-avatar">
                  {conv.visitor_name.charAt(0).toUpperCase()}
                </div>
                <div className="chat-admin-item-body">
                  <div className="chat-admin-item-top">
                    <strong>{conv.visitor_name}</strong>
                    <span>{formatDate(conv.updated_at)}</span>
                  </div>
                  <div className="chat-admin-item-meta">
                    <Mail size={11} /> {conv.visitor_email}
                  </div>
                  <div className="chat-admin-item-badges">
                    {hasReplied(conv) && <span className="chat-badge replied"><CheckCheck size={10} /> Replied</span>}
                    {conv.is_closed && <span className="chat-badge closed">Closed</span>}
                    {!hasReplied(conv) && !conv.is_closed && <span className="chat-badge new">New</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-admin-detail">
        {!selected ? (
          <div className="chat-admin-no-selection">
            <MessageSquare size={32} strokeWidth={1} />
            <p>Select a conversation to view and reply</p>
          </div>
        ) : (
          <>
            <div className="chat-admin-detail-header">
              <div>
                <h3>{selected.visitor_name}</h3>
                <div className="chat-admin-detail-meta">
                  <span><Mail size={12} /> {selected.visitor_email}</span>
                  <span><Clock size={12} /> Started {formatDate(selected.created_at)}</span>
                </div>
              </div>
              {!selected.is_closed && (
                <button className="chat-admin-close-btn" onClick={closeConversation}>
                  <X size={14} /> Close
                </button>
              )}
            </div>

            <div className="chat-admin-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.sender === 'visitor' ? 'is-visitor' : 'is-business'}`}>
                  {msg.sender === 'business' && <span className="chat-bubble-author">You</span>}
                  <p>{msg.content}</p>
                  <span className="chat-bubble-time">{formatTime(msg.created_at)}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {replyError && <div className="chat-admin-error">{replyError}</div>}
            {emailStatus === 'sent' && <div className="chat-admin-info"><CheckCheck size={14} /> Reply sent — visitor notified by email and chat.</div>}
            {emailStatus === 'failed' && <div className="chat-admin-warn">Reply saved in chat, but email notification could not be delivered. The visitor will see it when they return to the site.</div>}

            {selected.is_closed ? (
              <div className="chat-admin-closed">This conversation is closed.</div>
            ) : (
              <form className="chat-admin-input" onSubmit={handleReply}>
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply to the customer…"
                  required
                  minLength={1}
                  maxLength={2000}
                />
                <button type="submit" disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 size={18} className="chat-spin" /> : <Send size={18} />}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
