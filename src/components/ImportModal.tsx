'use client';
/* ===========================================================================
   SHARED IMPORT MODAL
   Used by the compliance library and by the calendar's due-date upload.
   Always runs a dry run first so the user sees exactly what will change
   before anything is written to the database.
   =========================================================================== */
import { useRef, useState } from 'react';
import { Ic, Modal, Note, useToast, downloadFile } from '@/components/ui';

export default function ImportModal({ kind, countries, onClose, onDone }: {
  kind: 'compliance' | 'duedate';
  countries: { code: string; name: string }[];
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [over, setOver] = useState(false);

  const endpoint = kind === 'compliance' ? '/api/compliances/import' : '/api/duedates/import';

  async function run(dryRun: boolean) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (dryRun) fd.append('dryRun', 'true');
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Import failed.');
      if (dryRun) { setPreview(j); }
      else {
        toast(
          kind === 'compliance'
            ? `${j.created} created, ${j.updated} updated.`
            : `${j.changed} due dates changed. ${j.notified} people notified.`,
          'ok');
        onDone();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed.', 'bad');
    } finally { setBusy(false); }
  }

  return (
    <Modal size="w"
           title={kind === 'compliance' ? 'Import compliances from Excel' : 'Upload revised due dates'}
           sub="Reviewed before anything is written"
           onClose={onClose}
           footer={<>
             <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
             {!preview
               ? <button className="btn btn-p" onClick={() => run(true)} disabled={!file || busy}>
                   {busy ? 'Checking…' : 'Check the file'}
                 </button>
               : <button className="btn btn-p" onClick={() => run(false)} disabled={busy}>
                   {busy ? 'Applying…' : 'Apply changes'}
                 </button>}
           </>}>

      {kind === 'duedate' && (
        <div className="f">
          <label>Download the template for a country first</label>
          <div className="row g8">
            <select value={country} onChange={e => setCountry(e.target.value)} style={{ flex: 1 }}>
              <option value="">Select a country…</option>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <button className="btn" disabled={!country}
                    onClick={() => downloadFile(`/api/duedates/template?country=${country}`,
                      `SGCMP_DueDates_${country}.xlsx`, toast)}>
              <Ic n="download" s={13} /> Template
            </button>
          </div>
          <div className="h">
            The template arrives pre-filled with that country&apos;s current due dates. Change only
            the new-date column and add a reason.
          </div>
        </div>
      )}

      <div className={`dz${over ? ' over' : ''}${busy ? ' busy' : ''}`}
           style={{ minHeight: 108, display: 'grid', placeItems: 'center' }}
           onClick={() => !busy && inputRef.current?.click()}
           onDragOver={e => { e.preventDefault(); setOver(true); }}
           onDragLeave={() => setOver(false)}
           onDrop={e => {
             e.preventDefault(); setOver(false);
             if (busy) return;
             const f = e.dataTransfer.files?.[0];
             if (f) { setFile(f); setPreview(null); }
           }}>
        <div>
          <Ic n="sheet" s={20} />
          {file
            ? (<><div className="small strong mt8">{file.name}</div>
                <div className="tiny muted">Click to choose a different workbook</div></>)
            : (<><div className="small strong mt8">Drop the completed workbook here</div>
                <div className="tiny muted">.xlsx or .xls</div></>)}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hide"
             onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />

      {preview && (
        <div className="mt16">
          {kind === 'compliance' ? (
            <>
              <div className="grid g-3 mb12">
                <div className="card kpi"><div className="kl">To create</div>
                  <div className="kv">{String(preview.willCreate ?? 0)}</div></div>
                <div className="card kpi"><div className="kl">To update</div>
                  <div className="kv">{String(preview.willUpdate ?? 0)}</div></div>
                <div className="card kpi"><div className="kl">Rejected</div>
                  <div className="kv">{String(preview.rejected ?? 0)}</div></div>
              </div>
              {Array.isArray(preview.sample) && (preview.sample as Record<string, string>[]).length > 0 && (
                <>
                  <div className="cap mb8">Sample of what will be written</div>
                  <div className="tw"><table className="dt">
                    <thead><tr><th>Code</th><th>Compliance</th><th>Country</th><th>Frequency</th></tr></thead>
                    <tbody>
                      {(preview.sample as Record<string, string>[]).map((s, i) => (
                        <tr key={i}><td className="mono small">{s.code}</td>
                          <td className="w small">{s.title}</td>
                          <td className="small">{s.country}</td>
                          <td className="small">{s.frequency}</td></tr>
                      ))}
                    </tbody>
                  </table></div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="grid g-2 mb12">
                <div className="card kpi"><div className="kl">Due dates that will change</div>
                  <div className="kv">{String(preview.willChange ?? 0)}</div></div>
                <div className="card kpi"><div className="kl">Rows rejected</div>
                  <div className="kv">{String(preview.rejected ?? 0)}</div></div>
              </div>
              {Array.isArray(preview.sample) && (preview.sample as Record<string, string>[]).length > 0 && (
                <>
                  <div className="cap mb8">Changes detected</div>
                  <div className="tw"><table className="dt">
                    <thead><tr><th>Compliance</th><th>Entity</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
                    <tbody>
                      {(preview.sample as Record<string, string>[]).map((s, i) => (
                        <tr key={i}>
                          <td className="w small">{s.compliance}</td>
                          <td className="small mono">{s.entity}</td>
                          <td className="small num">{s.from}</td>
                          <td className="small num strong">{s.to}</td>
                          <td className="small">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  <div className="mt12"><Note kind="w">
                    Applying this will update the calendar, recalculate delay, notify everyone
                    attached to the affected entities and raise a country-specific popup for them.
                  </Note></div>
                </>
              )}
            </>
          )}

          {Array.isArray(preview.errors) && (preview.errors as string[]).length > 0 && (
            <div className="mt12">
              <div className="cap mb8">Rows that will be skipped</div>
              {(preview.errors as string[]).slice(0, 12).map((e, i) => (
                <div className="small" key={i} style={{ color: 'var(--bad-700)' }}>· {e}</div>
              ))}
              {(preview.errors as string[]).length > 12 && (
                <div className="tiny muted mt4">…and {(preview.errors as string[]).length - 12} more.</div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
