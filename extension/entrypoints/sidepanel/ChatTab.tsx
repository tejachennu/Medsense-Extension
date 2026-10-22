import { useEffect, useState } from 'react';
import { api, type ChatEntry } from '@/lib/api';

export default function ChatTab({ caseId }: { caseId?: string }) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (caseId) api.chatHistory(caseId).then(setMessages, () => setMessages([]));
  }, [caseId]);

  if (!caseId) return <p className="card hint">Read a case on the Audit tab first.</p>;

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setQuestion('');
    try {
      const { answer } = await api.ask(caseId!, q);
      setMessages((m) => [...m, { role: 'model', text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Ask / discuss case {caseId}</h2>
      <p className="hint">Uses the case details and latest audit findings, not the images themselves.</p>
      <ul className="chat">
        {messages.map((m, i) => (
          <li key={i} className={m.role}>
            {m.text}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <textarea
        rows={3}
        value={question}
        placeholder="e.g. why is the admission photo marked absent?"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), ask())}
      />
      <button className="primary" disabled={busy} onClick={ask}>
        {busy ? 'Thinking…' : 'Ask'}
      </button>
    </section>
  );
}
