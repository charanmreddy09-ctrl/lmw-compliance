'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Note, Spinner, fmtDate, useToast } from '@/components/ui';

type EntityRow = { id: string; name: string; short_name: string; country_name: string };
type Applic = {
  compliance_id: string; code: string; title: string; category: string;
  excluded: boolean; reason: string | null; excluded_at: string | null; excluded_by: string | null;
};

/* A dedicated home for "mark this compliance not applicable to this entity",
   pulled out of the Entities detail page into its own sidebar tab (Reviewer
   only) so it does not have to be discovered by opening an entity first. */
export default function Exclusions() {
  const toast = useToast();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entityId, setEntityId] = useState('');
  const [entityName, setEntityName] = useState('');
  const [rows, setRows] = useState<Applic[]>([]);
  const [cat, setCat] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/entities').then(r => r.json()).then(d => {
      setEntities(d.entities ?? []);
      if (d.entities?.length) setEntityId(d.entities[0].id);
    }).catch(() => setErr('Unable to load entities.'));
  }, []);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/entities/${entityId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Unable to load this entity.');
      setRows(j.applicability ?? []);
      setEntityName(j.entity?.short_name ?? '');
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load this entity.');
    } finally { setLoading(false); }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(a: Applic) {
    if (a.excluded) {
      if (!confirm(`Mark "${a.title}" applicable again for ${entityName}? Its obligations re-enter the normal workflow.`)) return;
      try {
        const res = await fetch(`/api/compliance-exclusions?compliance_id=${a.compliance_id}&entity_id=${entityId}`, { method: 'DELETE' });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        toast(`Marked applicable again - ${j.affected} obligation${j.affected === 1 ? '' : 's'} reopened.`, 'ok');
        load();
      } catch (e) { toast(e instanceof Error ? e.message : 'Could not update.', 'bad'); }
    } else {
      const reason = prompt(`Why does "${a.title}" not apply to ${entityName}? (shown in the audit trail)`);
      if (reason === null) return;
      try {
        const res = await fetch('/api/compliance-exclusions', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ compliance_id: a.compliance_id, entity_id: entityId, reason: reason || undefined }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        toast(`Marked not applicable - ${j.affected} obligation${j.affected === 1 ? '' : 's'} excluded from the count.`, 'ok');
        load();
      } catch (e) { toast(e instanceof Error ? e.message : 'Could not update.', 'bad'); }
    }
  }

  const cats = useMemo(() => [...new Set(rows.map(r => r.category))].sort(), [rows]);
  const shown = useMemo(() => rows.filter(r => !cat || r.category === cat), [rows, cat]);
  const excludedCount = rows.filter(r => r.excluded).length;

  if (err) return <Note kind="b">{err}</Note>;

  return (
    <>
      <div className="toolbar no-print">
        <select value={entityId} onChange={e => setEntityId(e.target.value)} aria-label="Entity">
          {entities.map(e => <option key={e.id} value={e.id}>{e.short_name} ({e.country_name})</option>)}
        </select>
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Filter by law">
          <option value="">All laws</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="grow" />
        <span className="small muted">{excludedCount} marked not applicable</span>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Compliance applicability - {entityName}</h3>
          <span className="tiny muted">
            Mark a compliance not applicable to remove it and its obligations from this entity&apos;s counts
          </span>
        </div>
        {loading ? <div className="card-b"><Spinner label="Loading…" /></div> : (
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Compliance</th><th>Law</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={4}><div className="empty">No compliances match this entity and filter.</div></td></tr>
                )}
                {shown.map(a => (
                  <tr key={a.compliance_id}>
                    <td><div className="t1">{a.title}</div><div className="t2 mono">{a.code}</div></td>
                    <td className="small">{a.category}</td>
                    <td>
                      {a.excluded
                        ? <span className="pill p-mute" title={`${a.excluded_by ?? ''} ${a.excluded_at ? fmtDate(a.excluded_at) : ''}`}>
                            Not applicable{a.reason ? ` - ${a.reason}` : ''}
                          </span>
                        : <span className="pill p-ok nd">Applicable</span>}
                    </td>
                    <td className="nowrap no-print">
                      <button className="btn btn-xs" onClick={() => toggle(a)}>
                        {a.excluded ? 'Mark applicable' : 'Mark not applicable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
