import { useState } from 'react';
import type { ScrapedCase } from '@/lib/messages';
import AuditTab from './AuditTab';
import ChatTab from './ChatTab';
import SettingsTab from './SettingsTab';

type Tab = 'audit' | 'chat' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('audit');
  // Shared so the chat tab talks about the case the audit tab loaded.
  const [currentCase, setCurrentCase] = useState<ScrapedCase | null>(null);

  return (
    <main>
      <header>
        <h1>MedSense</h1>
        <nav>
          {(['audit', 'chat', 'settings'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>
      {/* Hidden instead of unmounted so a running pull keeps going while you chat. */}
      <div hidden={tab !== 'audit'}>
        <AuditTab currentCase={currentCase} onCase={setCurrentCase} />
      </div>
      {tab === 'chat' && <ChatTab caseId={currentCase?.caseId} />}
      {tab === 'settings' && <SettingsTab />}
      <footer>Advisory only. MedSense never marks documents or submits decisions in TMS.</footer>
    </main>
  );
}
