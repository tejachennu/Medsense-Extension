import { useEffect, useRef, useState } from 'react';
import { api, type AuditResult, type Stage, type Status } from '@/lib/api';
import type { CapturedPage, ScrapedCase } from '@/lib/messages';
import { activeTmsTab, screenshotElement, sendToTab } from '@/lib/tab';

const MAX_PAGES = 60;
const ICON: Record<Status, string> = { present: '✓', partial: '◐', absent: '✗', unclear: '?' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  currentCase: ScrapedCase | null;
  onCase: (c: ScrapedCase | null) => void;
}

export default function AuditTab({ currentCase: c, onCase }: Props) {
  const [stage, setStage] = useState<Stage>('preauth');
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const control = useRef({ stop: false, paused: false });

  useEffect(() => {
    control.current.paused = paused;
  }, [paused]);

  const note = (line: string) => setLog((l) => [...l.slice(-30), line]);

  async function run(task: () => Promise<void>) {
    control.current = { stop: false, paused: false };
    setPaused(false);
    setBusy(true);
    try {
      await task();
    } catch (err) {
      note(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function readCase() {
    const tab = await activeTmsTab();
    const scraped = await sendToTab<ScrapedCase>(tab.id, { type: 'readCase' });
    onCase(scraped);
    note(`Read case ${scraped.caseId}`);
    const saved = await api.getCase(scraped.caseId).catch(() => null);
    setAudit(saved?.audit ?? null);
    return scraped;
  }

  async function saveCase(current: ScrapedCase) {
    await api.saveCase(current);
    note(`Saved case ${current.caseId}`);
  }

  async function pullDocuments(current: ScrapedCase) {
    const tab = await activeTmsTab();
    await saveCase(current);
    let duplicatesInARow = 0;
    for (let n = 1; n <= MAX_PAGES; n++) {
      while (control.current.paused && !control.current.stop) await sleep(300);
      if (control.current.stop) return note('Stopped');

      const page = await sendToTab<CapturedPage>(tab.id, { type: 'captureCurrent' });
      const position = page.counter ? `${page.counter.index}/${page.counter.total}` : `${n}`;
      note(`${stage} ${position}: capturing "${page.label}"…`);
      const image = page.image ?? (await screenshotElement(tab.windowId, page));
      const { duplicate } = await api.uploadDocument(current.caseId, {
        stage,
        label: page.label,
        page: page.counter?.index ?? n,
        ...image,
      });
      duplicatesInARow = duplicate ? duplicatesInARow + 1 : 0;
      if (duplicatesInARow >= 2) return note('Viewer stopped changing; finished');
      if (!page.counter || page.counter.index >= page.counter.total) break;
      await sendToTab(tab.id, { type: 'nextDocument' });
    }
    note(`Case ${current.caseId}: ${stage} documents saved`);
  }

  async function runAudit(current: ScrapedCase) {
    note(`Asking Gemini to check ${stage} documents…`);
    const result = await api.audit(current.caseId, stage);
    setAudit(result);
    note(`Audit done (${result.model})`);
  }

  async function smartRun() {
    const current = c ?? (await readCase());
    await pullDocuments(current);
    if (!control.current.stop) await runAudit(current);
  }

  const update = (patch: Partial<ScrapedCase>) => c && onCase({ ...c, ...patch });

  return (
    <section>
      <div className="card">
        <div className="row">
          <button disabled={busy} onClick={() => run(async () => void (await readCase()))}>
            Read case from page
          </button>
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} disabled={busy}>
            <option value="preauth">Pre-auth</option>
            <option value="claim">Claim</option>
          </select>
        </div>
        {c && (
          <dl>
            <dt>Case</dt>
            <dd>{c.caseId}</dd>
            <dt>Patient</dt>
            <dd>
              <input value={c.patientName ?? ''} onChange={(e) => update({ patientName: e.target.value })} />
            </dd>
            <dt>State</dt>
            <dd>
              <input value={c.state ?? ''} placeholder="e.g. Himachal Pradesh" onChange={(e) => update({ state: e.target.value })} />
            </dd>
            <dt>Packages</dt>
            <dd>
              <input
                value={c.packageCodes.join(', ')}
                onChange={(e) => update({ packageCodes: e.target.value.split(/[,\s]+/).filter(Boolean) })}
              />
            </dd>
            <dt>Amount</dt>
            <dd>{c.amountRequested != null ? `₹${c.amountRequested.toLocaleString('en-IN')}` : '—'}</dd>
          </dl>
        )}
        <p className="hint">Check the fields above; state and package codes decide which rules apply.</p>
      </div>

      <div className="card">
        <p className="hint">Open the case's document viewer in TMS on the first document, then:</p>
        <button className="primary" disabled={busy} onClick={() => run(smartRun)}>
          Smart run (pull + audit)
        </button>
        <div className="row">
          <button disabled={busy || !c} onClick={() => run(() => pullDocuments(c!))}>
            Pull documents
          </button>
          <button disabled={busy || !c} onClick={() => run(() => runAudit(c!))}>
            Audit saved docs
          </button>
          <button
            disabled={busy || !c}
            onClick={() => run(async () => void (await api.clearDocuments(c!.caseId, stage), note(`Cleared ${stage} documents`)))}
          >
            Clear
          </button>
        </div>
        {busy && (
          <div className="row">
            <button onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
            <button className="danger" onClick={() => (control.current.stop = true)}>
              Stop
            </button>
          </div>
        )}
        {log.length > 0 && (
          <ol className="log">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}
      </div>

      {audit && (
        <div className="card">
          <h2>
            {audit.stage === 'preauth' ? 'Pre-auth' : 'Claim'} audit
            <small> · {new Date(audit.createdAt).toLocaleString()}</small>
          </h2>
          <p className="counts">
            {(['present', 'partial', 'absent', 'unclear'] as const).map((s) => (
              <span key={s} className={s}>
                {audit.counts[s] ?? 0} {s}
              </span>
            ))}
          </p>
          <p>{audit.summary}</p>
          <ul className="findings">
            {audit.findings.map((f) => (
              <li key={f.id} className={f.status}>
                <strong>
                  {ICON[f.status]} {f.title}
                </strong>
                {f.pages.length > 0 && <small> · img {f.pages.join(', ')}</small>}
                {f.evidence && <p>{f.evidence}</p>}
                {f.missing && (
                  <p className="missing">
                    <b>missing:</b> {f.missing}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
