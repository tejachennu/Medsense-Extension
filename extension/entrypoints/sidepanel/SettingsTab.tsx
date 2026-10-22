import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { defaultSelectors, mergeSelectors } from '@/lib/selectors';
import { settingsItem, type Settings } from '@/lib/settings';

export default function SettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    settingsItem.getValue().then(setSettings);
  }, []);

  if (!settings) return null;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  async function save() {
    try {
      mergeSelectors(settings!.selectorOverrides);
    } catch {
      return setStatus('Selector overrides are not valid JSON');
    }
    await settingsItem.setValue(settings!);
    try {
      const me = await api.me();
      setStatus(`Saved. Connected as ${me.auditor}, model ${me.model}.`);
    } catch (err) {
      setStatus(`Saved, but the server check failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return (
    <section className="card">
      <label>
        Server URL
        <input value={settings.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} />
      </label>
      <label>
        API key
        <input type="password" value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
      </label>
      <label>
        Selector overrides (JSON, merged over the defaults)
        <textarea
          rows={8}
          value={settings.selectorOverrides}
          placeholder='{"viewer": {"next": "button.my-next"}}'
          onChange={(e) => set({ selectorOverrides: e.target.value })}
        />
      </label>
      <details>
        <summary>Default selectors</summary>
        <pre>{JSON.stringify(defaultSelectors, null, 2)}</pre>
      </details>
      <button className="primary" onClick={save}>
        Save &amp; test connection
      </button>
      {status && <p className="hint">{status}</p>}
    </section>
  );
}
