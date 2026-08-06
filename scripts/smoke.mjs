/* ===========================================================================
   SGCMP end-to-end smoke test
   Exercises every API route, role boundary, validation rule and workflow
   transition against a running server, using real HTTP and real files.

   NOTE: this script's role/entity coverage below (cfo@, groupfinance@,
   reviewer.tax@, user.in.hq@, countryhead.in@, admin@, auditor@ ...) was
   written against the original demonstration roster. db/org.ts now ships as
   a blank template with a single admin user, so most of this file's calls
   will 404/401 until you add a comparable set of users and entities for your
   own company. Update the email constants below (or re-seed with a fuller
   USERS list) once you have real data to test against.

     npm run start -- -p 3100     (terminal 1)
     npm run smoke                (terminal 2)
   =========================================================================== */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100';
const PW = process.env.SEED_PASSWORD || 'ChangeMe@2026';
const NIL = '00000000-0000-0000-0000-000000000000';   // valid uuid, no such row

let pass = 0, fail = 0;
const failures = [];
const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      B = s => `\x1b[1m${s}\x1b[0m`, D = s => `\x1b[2m${s}\x1b[0m`;

const ok = (l, n) => { pass++; console.log(`  ${G('PASS')}  ${l}${n ? D('  ' + n) : ''}`); };
const bad = (l, n) => { fail++; failures.push(l); console.log(`  ${R('FAIL')}  ${l}${n ? D('  ' + n) : ''}`); };
const check = (c, l, n) => c ? ok(l, n) : bad(l, n);
const section = t => console.log(`\n${B(t)}`);
const note = s => console.log(D('        ' + s));

/* --------------------------------------------------------------- http ------ */
const jars = new Map();

async function http(path, { method = 'GET', as = null, json = null, form = null,
                            headers = {}, redirect = 'manual' } = {}) {
  const h = { ...headers };
  if (as && jars.has(as)) h.cookie = jars.get(as);
  let body;
  if (json !== null) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(BASE + path, { method, headers: h, body, redirect, signal: ac.signal });
    for (const c of res.headers.getSetCookie?.() || []) {
      if (!as) continue;
      const m = new Map((jars.get(as) || '').split('; ').filter(Boolean).map(p => [p.split('=')[0], p]));
      const kv = c.split(';')[0]; m.set(kv.split('=')[0], kv);
      jars.set(as, [...m.values()].join('; '));
    }
    const ct = res.headers.get('content-type') || '';
    let data = null, buf = null, text = null;
    if (ct.includes('json')) { text = await res.text(); try { data = JSON.parse(text); } catch {} }
    else if (ct.includes('text/html')) text = await res.text();
    else buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ct, data, text, buf,
             loc: res.headers.get('location'), cd: res.headers.get('content-disposition') };
  } catch (e) {
    return { status: 0, err: String(e.message || e), ct: '', data: null, text: null, buf: null };
  } finally { clearTimeout(t); }
}

const login = async (name, email, password = PW) => {
  jars.delete(name);
  return http('/api/auth/login', { method: 'POST', as: name, json: { email, password } });
};
const isXlsx = b => b && b.length > 2000 && b[0] === 0x50 && b[1] === 0x4b;
const in4xx = s => s >= 400 && s < 500;

const { createRequire } = await import('node:module');
const XLSX = createRequire(import.meta.url)('xlsx');
const sheetBuf = (name, rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
const fd = (fields, file) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  if (file) f.append('file', new Blob([file.buf], { type: file.type }), file.name);
  return f;
};
const XLSXMIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* =========================================================================== */
console.log(B(`\nSGCMP smoke test  ->  ${BASE}\n${'='.repeat(60)}`));
if ((await http('/')).status === 0) {
  console.log(R(`\nServer not reachable at ${BASE}. Start it with: npm run start -- -p 3100\n`));
  process.exit(2);
}

/* ----------------------------------------------------- 1. public ---------- */
section('1. Public surface');
{
  const r = await http('/');
  check(r.status === 200, 'landing page renders', `HTTP ${r.status}`);
  check(!/type="password"/.test(r.text || ''), 'landing page carries NO login form');
  check(/href="\/signin"/.test(r.text || ''), 'landing links to the separate /signin route');
  check(!/MRL|Management Representation/i.test(r.text || ''), 'landing never mentions MRL');
  const s = await http('/signin');
  check(s.status === 200 && /type="password"/.test(s.text || ''), 'signin page renders with password field', `HTTP ${s.status}`);
}

/* --------------------------------------------- 2. route protection ------- */
section('2. Route protection (unauthenticated)');
for (const p of ['dashboard', 'entities', 'compliance', 'register', 'calendar', 'reviews', 'reports', 'admin']) {
  const r = await http('/' + p);
  check(r.status === 307 && (r.loc || '').includes('/signin'), `/${p} -> /signin`, `HTTP ${r.status}`);
}
check((await http('/api/dashboard')).status === 401, 'API rejects unauthenticated caller');
check((await http('/api/dashboard', { headers: { cookie: 'sgcmp_session=forged.jwt.value' } })).status === 401,
  'forged session cookie rejected');

/* --------------------------------------------------- 3. auth ------------- */
section('3. Authentication');
{
  const w = await login('x', 'cfo@suprajit.example', 'wrong-password');
  check(w.status === 401 && w.data?.error, 'wrong password -> 401 JSON', `HTTP ${w.status}`);
  check((await login('x', 'ghost@nowhere.example')).status === 401, 'unknown email -> 401');
  check(in4xx((await http('/api/auth/login', { method: 'POST', json: {} })).status), 'empty credentials -> 4xx not 500');
}
const ACTORS = {
  cfo: 'cfo@suprajit.example', office: 'groupfinance@suprajit.example',
  reviewer: 'reviewer.tax@suprajit.example', legal: 'reviewer.legal@suprajit.example',
  preparer: 'user.us@suprajit.example', inPrep: 'user.in.hq@suprajit.example',
  head: 'countryhead.in@suprajit.example', admin: 'admin@suprajit.example',
  auditor: 'auditor@suprajit.example',
};
const LANDING = {};
for (const [k, email] of Object.entries(ACTORS)) {
  const r = await login(k, email);
  LANDING[k] = r.data?.redirect;
  check(r.status === 200 && jars.get(k)?.includes('sgcmp_session'), `login ${k}`, email);
}
check(/CFO/.test(JSON.stringify((await http('/api/auth/me', { as: 'cfo' })).data)), 'session exposes role + permissions');
check(LANDING.cfo === '/dashboard', 'CFO lands on /dashboard', String(LANDING.cfo));
check(LANDING.preparer === '/register', 'preparer lands on /register', String(LANDING.preparer));
check(LANDING.reviewer === '/reviews', 'reviewer lands on /reviews', String(LANDING.reviewer));

/* ------------------------------------------ 4. score + dashboard -------- */
section('4. Compliance score + CFO dashboard');
let dash = null;
{
  const r = await http('/api/dashboard', { as: 'cfo' });
  dash = r.data;
  check(r.status === 200, 'dashboard API 200', `HTTP ${r.status}`);
  const need = ['overall', 'byEntity', 'byCountry', 'byDivision', 'byCategory', 'heat',
                'upcoming', 'activity', 'dueChanges', 'reviewerPerf', 'pendingReview'];
  const miss = need.filter(k => !(k in (dash || {})));
  check(!miss.length, 'whole dashboard from ONE request', miss.length ? 'missing ' + miss : `${need.length} blocks`);
  check(typeof dash?.overall?.score === 'number', 'group compliance score is live',
    `score=${dash?.overall?.score} across ${dash?.overall?.total} obligations`);
  check(!/MRL|Management Representation/i.test(JSON.stringify(dash || {})), 'dashboard data never mentions MRL');
  const b = dash?.overall;
  check(b && 'base' in b && 'overduePenalty' in b, 'score is explainable, not a magic number',
    b ? `base=${b.base} - overdue ${b.overduePenalty} - delay ${b.delayPenalty} = ${b.score}` : '');
  const c = dash?.byCountry?.[0];
  check(c && 'total' in c && 'approved' in c && 'score' in c, 'Overall tab: applicable vs followed per country');
  if (dash?.byCountry) note(dash.byCountry.map(x => `${x.countryCode ?? x.country_code}:${x.approved}/${x.total}`).join('  '));
  check((dash?.heat || []).length > 0, 'compliance heat map (country x category)', `${dash?.heat?.length} cells`);
  check(Object.keys(dash?.byEntity ?? {}).length > 1, 'entity-wise scores',
    `${Object.keys(dash?.byEntity ?? {}).length} entities`);
  check((dash?.byDivision || []).length > 0, 'division-wise scores', `${dash?.byDivision?.length} divisions`);
}

/* --------------------------------------------- 5. role boundaries ------- */
section('5. Role boundaries');
{
  const anyOb = ((await http('/api/obligations?limit=5', { as: 'cfo' })).data?.obligations || [])[0];
  const r = await http('/api/reviews', { method: 'POST', as: 'cfo',
    json: { obligationId: anyOb?.id, action: 'approve' } });
  check(r.status === 403, 'CFO cannot review individual compliances',
    `HTTP ${r.status} ${(r.data?.error ?? '').slice(0, 55)}`);
  check((await http('/api/users', { as: 'preparer' })).status === 403, 'preparer cannot manage users');
  check((await http('/api/users', { as: 'cfo' })).status === 200, 'CFO can manage users');
  check((await http('/api/audit?limit=20', { as: 'auditor' })).status === 200, 'auditor can read the audit trail');
  check((await http('/api/delegations', { method: 'POST', as: 'preparer',
    json: { to_user_id: NIL, scope_type: 'all' } })).status === 403, 'preparer cannot delegate');

  const mine = await http('/api/obligations?limit=2000', { as: 'preparer' });
  const rows = mine.data?.obligations || [];
  const ents = [...new Set(rows.map(x => x.entity_id))];
  check(rows.length > 0 && ents.length === 1, 'preparer sees only their own entity',
    `${rows.length} rows scoped to ${ents.join(',')}`);

  const all = await http('/api/obligations?limit=3000', { as: 'cfo' });
  const entAll = [...new Set((all.data?.obligations || []).map(x => x.entity_id))];
  check(entAll.length > 5, 'CFO sees the whole group', `${entAll.length} entities, ${all.data?.count} obligations`);
}

/* -------------------------------------- 6. compliance library ---------- */
section('6. Compliance library (dynamic, no code changes)');
{
  const all = await http('/api/compliances', { as: 'cfo' });
  const lib = all.data?.compliances || [];
  check(all.status === 200 && lib.length > 350, 'library returns the seeded corpus', `${lib.length} compliances`);
  check((all.data?.countries || []).length >= 10, 'country master returned', `${all.data?.countries?.length} countries`);
  check((all.data?.jurisdictions || []).length > 15, 'jurisdiction master returned', `${all.data?.jurisdictions?.length} jurisdictions`);

  for (const [label, qs] of [['US -> California', 'country=US&jurisdiction=US-CA'],
                             ['US -> Texas', 'country=US&jurisdiction=US-TX'],
                             ['US -> Michigan', 'country=US&jurisdiction=US-MI'],
                             ['India -> Karnataka', 'country=IN&jurisdiction=IN-KA'],
                             ['Canada -> Ontario', 'country=CA&jurisdiction=CA-ON']]) {
    const r = await http(`/api/compliances?${qs}`, { as: 'cfo' });
    const n = (r.data?.compliances || []).length;
    check(r.status === 200 && n > 0, `state library: ${label}`, `${n} rows`);
  }
  const cat = await http('/api/compliances?category=direct_tax', { as: 'cfo' });
  check((cat.data?.compliances || []).length > 0, 'filter by category', `${cat.data?.compliances?.length} rows`);
  const srch = await http('/api/compliances?search=GST', { as: 'cfo' });
  check((srch.data?.compliances || []).length > 0, 'free-text search', `${srch.data?.compliances?.length} hits`);

  /* clear any leftover from an earlier run so create is deterministic */
  for (const s of (await http('/api/compliances?search=Smoke%20test', { as: 'cfo' })).data?.compliances || [])
    await http(`/api/compliances?id=${s.id}&mode=delete`, { method: 'DELETE', as: 'cfo' });

  const cr = await http('/api/compliances', { method: 'POST', as: 'cfo', json: {
    code: `US-CA-SMOKE-${Date.now().toString(36).toUpperCase()}`,
    country_code: 'US', jurisdiction_id: 'US-CA',
    category_id: 'labour_law', title: 'Smoke test quarterly wage report',
    authority: 'California EDD', applicable_law: 'CUIC s.1088', frequency: 'Quarterly',
    due_rule: 'End of month following quarter end',
    evidence_required: ['Filed DE 9', 'Payment confirmation'],
    risk_level: 'Medium', penalty: 'USD 500 plus interest' } });
  const cid = cr.data?.id, ccode = cr.data?.code;
  check(cr.status === 200 && cid, 'create a compliance in-app', `HTTP ${cr.status} code=${ccode}`);

  const dupe = await http('/api/compliances', { method: 'POST', as: 'cfo', json: {
    code: ccode, country_code: 'US', jurisdiction_id: 'US-CA',
    category_id: 'labour_law', title: 'Duplicate', frequency: 'Quarterly' } });
  check(dupe.status === 409, 'duplicate code -> 409 with a readable message',
    `HTTP ${dupe.status} "${(dupe.data?.error ?? '').slice(0, 60)}"`);

  const ed = await http('/api/compliances', { method: 'PATCH', as: 'cfo',
    json: { id: cid, title: 'Smoke test quarterly wage report (revised)', risk_level: 'High' } });
  check(ed.status === 200, 'edit a compliance', `HTTP ${ed.status}`);
  const back = (await http('/api/compliances?search=Smoke%20test', { as: 'cfo' })).data?.compliances || [];
  check(back[0]?.risk_level === 'High', 'edit is live immediately', `risk_level=${back[0]?.risk_level}`);

  check((await http(`/api/compliances?id=${cid}&mode=archive`, { method: 'DELETE', as: 'cfo' })).status === 200, 'archive');
  check((await http(`/api/compliances?id=${cid}&mode=restore`, { method: 'DELETE', as: 'cfo' })).status === 200, 'restore');
  check((await http(`/api/compliances?id=${cid}&mode=delete`, { method: 'DELETE', as: 'cfo' })).status === 200, 'delete (soft)');

  const badFk = await http('/api/compliances', { method: 'POST', as: 'cfo',
    json: { code: 'ZZ-BAD-1', country_code: 'ZZ', category_id: 'nonexistent', title: 'bad', frequency: 'Annual' } });
  check(in4xx(badFk.status), 'invalid references rejected, not written',
    `HTTP ${badFk.status} "${(badFk.data?.error ?? '').slice(0, 60)}"`);
  check((await http('/api/compliances', { method: 'POST', as: 'cfo',
    json: { country_code: 'US', category_id: 'direct_tax', frequency: 'Annual' } })).status === 400,
    'missing compliance name -> 400');
  check((await http(`/api/compliances?id=${NIL}&mode=delete`, { method: 'DELETE', as: 'cfo' })).status === 404,
    'delete unknown id -> 404');
  check(in4xx((await http('/api/compliances?id=not-a-uuid&mode=delete', { method: 'DELETE', as: 'cfo' })).status),
    'malformed id -> 4xx not 500');
}

/* -------------------------------- 7. templates + import ---------------- */
section('7. Excel templates and import');
for (const c of ['US', 'IN', 'DE', 'MX', 'CN']) {
  const r = await http(`/api/compliances/template?country=${c}`, { as: 'cfo' });
  check(r.status === 200 && isXlsx(r.buf), `compliance template ${c}`, `${r.buf?.length || 0} bytes`);
}
{
  const r = await http('/api/duedates/template?country=IN', { as: 'cfo' });
  check(r.status === 200 && isXlsx(r.buf), 'due-date template IN (pre-filled)', `${r.buf?.length || 0} bytes`);

  const buf = sheetBuf('Compliances', [{
    'Code': 'IN-SMOKE-IMP1', 'Country': 'IN', 'Jurisdiction': 'IN-FED', 'Category': 'direct_tax',
    'Compliance Name': 'Imported smoke compliance', 'Applicable Law': 'IT Act s.139(1)',
    'Form / Reference': 'ITR-6', 'Authority': 'CBDT',
    'Government Website': 'https://www.incometax.gov.in',
    'Frequency': 'Annual', 'Due Rule': '30 September', 'Due Day': 30, 'Due Month': 9,
    'Evidence Required (separate with |)': 'ITR-V acknowledgement|Computation',
    'Penalty': 'INR 10,000', 'Risk': 'High',
    'Applies Only If Listed': 'No', 'Applies Only If Factory': 'No', 'Applies Only If Importer': 'No',
  }]);

  const dry = await http('/api/compliances/import?dryRun=true', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'imp.xlsx', type: XLSXMIME }) });
  check(dry.status === 200 && dry.data?.preview, 'import dry-run previews changes',
    `create=${dry.data?.willCreate} update=${dry.data?.willUpdate} rejected=${dry.data?.rejected}`);
  check(!((await http('/api/compliances?search=Imported%20smoke', { as: 'cfo' })).data?.compliances || []).length,
    'dry-run wrote nothing to the database');

  const com = await http('/api/compliances/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'imp.xlsx', type: XLSXMIME }) });
  check(com.status === 200, 'import commit', `HTTP ${com.status} created=${com.data?.created} updated=${com.data?.updated}`);
  const after = (await http('/api/compliances?search=Imported%20smoke', { as: 'cfo' })).data?.compliances || [];
  check(after.length === 1, 'imported compliance is live with no code change', after[0]?.code);

  const upd = await http('/api/compliances/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'imp.xlsx', type: XLSXMIME }) });
  check(upd.status === 200 && upd.data?.updated >= 1, 're-import updates instead of duplicating',
    `created=${upd.data?.created} updated=${upd.data?.updated}`);

  const badRef = sheetBuf('Compliances', [{
    'Code': 'ZZ-BAD-IMP', 'Country': 'ZZ', 'Jurisdiction': 'ZZ', 'Category': 'not_a_category',
    'Compliance Name': 'Bad row', 'Frequency': 'Annual' }]);
  const br = await http('/api/compliances/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf: badRef, name: 'bad.xlsx', type: XLSXMIME }) });
  check(br.status === 200 && br.data?.rejected > 0, 'unknown country/category rejected with row numbers',
    (br.data?.errors?.[0] ?? '').slice(0, 80));

  check(in4xx((await http('/api/compliances/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf: Buffer.from('not a spreadsheet at all'), name: 'x.xlsx', type: XLSXMIME }) })).status),
    'corrupt upload rejected cleanly');

  for (const s of after) await http(`/api/compliances?id=${s.id}&mode=delete`, { method: 'DELETE', as: 'cfo' });
}

/* ------------------------------------------- 8. due-date engine -------- */
section('8. Due-date engine + country-specific popup');
{
  const before = await http('/api/obligations?country=IN&limit=2000', { as: 'cfo' });
  const list = before.data?.obligations || [];
  const target = list.find(r => r.status !== 'Approved') || list[0];
  check(!!target, 'picked a live Indian obligation', target ? `${target.code} ${target.period_label}` : 'none');

  /* Derive the new due date from whatever is currently stored, plus one day.
     That guarantees the engine has a real change to detect however many times
     this suite is run. */
  const cur = new Date(String(target?.due_date || '2026-06-15').slice(0, 10) + 'T00:00:00Z');
  cur.setUTCDate(cur.getUTCDate() + 1);
  const dd = String(cur.getUTCDate()).padStart(2, '0');
  const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = cur.getUTCFullYear();
  const newDue = `${dd}/${mm}/${yyyy}`;
  const expect = `${yyyy}-${mm}-${dd}`;
  const buf = sheetBuf('Due Dates', [{
    'Compliance Code': target?.code, 'Entity ID': target?.entity_id,
    'Period Label': target?.period_label,
    'New Due Date (DD/MM/YYYY)': newDue,
    'Reason for Change': 'Smoke test: CBDT extension notification',
  }]);

  const dry = await http('/api/duedates/import?dryRun=true', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'dd.xlsx', type: XLSXMIME }) });
  check(dry.status === 200, 'due-date dry-run', `HTTP ${dry.status} would change ${dry.data?.changed ?? dry.data?.willChange}`);

  const com = await http('/api/duedates/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'dd.xlsx', type: XLSXMIME }) });
  check(com.status === 200 && com.data?.changed >= 1, 'due date updated in one transaction',
    `${String(target?.due_date).slice(0, 10)} -> ${expect}, changed=${com.data?.changed} notified=${com.data?.notified}`);
  check(com.data?.byCountry && Object.keys(com.data.byCountry).length > 0,
    'change attributed to a country (drives the popup)', JSON.stringify(com.data?.byCountry));

  const post = await http('/api/obligations?country=IN&limit=2000', { as: 'cfo' });
  const moved = (post.data?.obligations || []).find(r => r.id === target?.id);
  check(String(moved?.due_date || '').startsWith(expect), 'new due date is live on the register',
    `due_date=${String(moved?.due_date).slice(0, 10)}`);
  check(moved?.original_due_date && String(moved.original_due_date).slice(0, 10) !== expect,
    'original due date retained for audit', `original=${String(moved?.original_due_date).slice(0, 10)}`);

  const same = await http('/api/duedates/import', { method: 'POST', as: 'cfo',
    form: fd({}, { buf, name: 'dd.xlsx', type: XLSXMIME }) });
  check(same.status === 200 && same.data?.changed === 0, 'unchanged rows are skipped, not re-notified',
    `changed=${same.data?.changed}`);

  /* The popup goes to everyone attached to the affected entity, plus anyone
     holding group-wide scope. Assert against a recipient we know qualifies. */
  const pop = await http('/api/notifications?popup=true', { as: 'cfo' });
  const prows = pop.data?.notifications || [];
  check(pop.status === 200, 'popup notification endpoint', `HTTP ${pop.status}`);
  const forCountry = prows.filter(n => n.country_code === 'IN' && n.kind === 'due_date_change');
  check(forCountry.length > 0, 'stakeholder received a country-specific popup',
    prows.length ? `${prows.length} popups, ${forCountry.length} for IN` : 'none');
  if (forCountry.length) {
    check((await http('/api/notifications', { method: 'POST', as: 'cfo', json: { ids: [forCountry[0].id] } })).status === 200,
      'popup can be acknowledged');
    const again = (await http('/api/notifications?popup=true', { as: 'cfo' })).data?.notifications || [];
    check(again.length < prows.length, 'acknowledged popup does not reappear', `${again.length} remaining`);
  }
  check(((await http('/api/dashboard', { as: 'cfo' })).data?.dueChanges || []).length > 0,
    'due-date change surfaces on the dashboard');
}

/* ---------------------- 9. upload -> review -> query -> approve -------- */
section('9. Workflow: upload -> validate -> review -> query -> resubmit -> approve');
let OB = null, EV = null;
{
  const q1 = await http('/api/obligations?mine=true&limit=2000', { as: 'preparer' });
  const list = q1.data?.obligations || [];
  const cand = list.find(r => ['Evidence Pending', 'Overdue', 'Not Started', 'Rejected'].includes(r.status)) || list[0];
  OB = cand?.id;
  check(!!OB, 'preparer has an obligation to file', cand ? `${cand.reference} ${cand.code} (${cand.status})` : 'none');

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const up = await http('/api/evidence', { method: 'POST', as: 'preparer',
    form: fd({ obligationId: OB, filedDate: '2026-07-20', docType: 'Filed return',
               comment: 'Filed through the department portal.' },
             { buf: pdf, name: 'return.pdf', type: 'application/pdf' }) });
  EV = up.data?.evidenceId;
  check(up.status === 200 && EV, 'evidence uploads successfully', `HTTP ${up.status} version=${up.data?.version}`);
  const v = up.data?.validation;
  check(v && Array.isArray(v.checks) && v.checks.length >= 6, 'auto-validation ran on upload',
    v ? `outcome=${v.outcome}, ${v.checks.length} checks` : 'none');
  if (v?.checks) note(v.checks.map(c => `${c.key}:${c.result}`).join('  '));

  const det = await http(`/api/obligations/${OB}`, { as: 'preparer' });
  check(['Submitted', 'Under Review'].includes(det.data?.obligation?.status),
    'obligation auto-moves into the review queue', `status=${det.data?.obligation?.status}`);
  check((det.data?.files || []).length > 0, 'document attached to the obligation', `${det.data?.files?.length} files`);

  check((await http('/api/evidence', { method: 'POST', as: 'preparer',
    form: fd({ obligationId: OB, filedDate: '2026-07-20' }, { buf: pdf, name: 'return.pdf', type: 'application/pdf' }) })).status === 409,
    'duplicate document blocked by checksum');

  const big = await http('/api/evidence', { method: 'POST', as: 'preparer',
    form: fd({ obligationId: OB }, { buf: Buffer.alloc(6 * 1024 * 1024, 7), name: 'big.pdf', type: 'application/pdf' }) });
  check(big.status === 413 || big.status === 400, 'oversized file rejected, server survives', `HTTP ${big.status}`);

  check(in4xx((await http('/api/evidence', { method: 'POST', as: 'preparer',
    form: fd({ obligationId: OB }, { buf: Buffer.from('MZ\x90\x00'), name: 'payload.exe', type: 'application/x-msdownload' }) })).status),
    'disallowed file type rejected');
  check(in4xx((await http('/api/evidence', { method: 'POST', as: 'preparer',
    form: fd({ obligationId: NIL }, { buf: pdf, name: 'a.pdf', type: 'application/pdf' }) })).status),
    'cannot file against an unknown obligation');
  check(in4xx((await http('/api/evidence', { method: 'POST', as: 'preparer', form: fd({ obligationId: OB }) })).status),
    'upload with no file -> 4xx');

  if (EV) {
    const pv = await http(`/api/evidence/${EV}`, { as: 'preparer' });
    check(pv.status === 200 && pv.buf?.subarray(0, 4).toString() === '%PDF', 'preview streams real PDF bytes',
      `${pv.buf?.length} bytes`);
    const dl = await http(`/api/evidence/${EV}?dl=1`, { as: 'preparer' });
    check(dl.status === 200 && /attachment/.test(dl.cd || ''), 'download sends an attachment header');
    check((await http(`/api/evidence/${EV}`, { as: 'inPrep' })).status === 403,
      'another entity cannot read this document');
  }

  const queue = await http('/api/reviews', { as: 'reviewer' });
  check(queue.status === 200 && Array.isArray(queue.data?.queue), 'reviewer queue loads',
    `${queue.data?.queue?.length} items pending`);
  check((await http('/api/reviews', { method: 'POST', as: 'reviewer', json: { obligationId: OB, action: 'query' } })).status === 400,
    'query without a comment is refused');
  check((await http('/api/reviews', { method: 'POST', as: 'reviewer',
    json: { obligationId: OB, action: 'query', comment: 'Please attach the bank challan counterfoil.' } })).status === 200,
    'reviewer raises a query');
  check((await http(`/api/obligations/${OB}`, { as: 'preparer' })).data?.obligation?.status === 'Query Raised',
    'item returns to the preparer');
  check((await http('/api/reviews', { method: 'POST', as: 'preparer',
    json: { obligationId: OB, action: 'resubmit' } })).status === 200, 'preparer resubmits');
  check((await http('/api/reviews', { method: 'POST', as: 'reviewer',
    json: { obligationId: OB, action: 'approve', comment: 'Verified against the department portal.' } })).status === 200,
    'reviewer approves');

  const fin = await http(`/api/obligations/${OB}`, { as: 'reviewer' });
  check(fin.data?.obligation?.status === 'Approved', 'status is Approved', `status=${fin.data?.obligation?.status}`);
  const trail = fin.data?.trail || [];
  check(trail.length >= 4, 'complete audit trail retained', `${trail.length} recorded actions`);
  if (trail.length) note(trail.slice(0, 6).map(t => t.action).join(' -> '));

  for (const a of ['reject', 'reopen', 'comment', 'escalate']) {
    const r = await http('/api/reviews', { method: 'POST', as: 'reviewer',
      json: { obligationId: OB, action: a, comment: `smoke ${a}` } });
    check(r.status === 200, `workflow action: ${a}`, `HTTP ${r.status}`);
  }
  check(in4xx((await http('/api/reviews', { method: 'POST', as: 'reviewer',
    json: { obligationId: OB, action: 'teleport', comment: 'x' } })).status), 'unknown workflow action rejected');

  const users = (await http('/api/users', { as: 'cfo' })).data?.users || [];
  const legalId = users.find(x => x.email === ACTORS.legal)?.id;
  const inPrepId = users.find(x => x.email === ACTORS.inPrep)?.id;
  const asg = await http(`/api/obligations/${OB}`, { method: 'PATCH', as: 'reviewer', json: { reviewer_id: legalId } });
  check(asg.status === 200 && asg.data?.obligation?.reviewer_id === legalId, 'reassign the reviewer', `HTTP ${asg.status}`);
  const asg2 = await http(`/api/obligations/${OB}`, { method: 'PATCH', as: 'reviewer', json: { assigned_to: inPrepId } });
  check(asg2.status === 200 && asg2.data?.obligation?.assigned_to === inPrepId, 'assign a different preparer',
    `HTTP ${asg2.status}`);
  check(in4xx((await http(`/api/obligations/${OB}`, { method: 'PATCH', as: 'reviewer', json: { reviewer_id: 'not-a-uuid' } })).status),
    'malformed assignee id -> 4xx not 500');
  check((await http(`/api/obligations/${OB}`, { method: 'PATCH', as: 'head', json: { reviewer_id: legalId } })).status === 403,
    'India country head cannot reassign a US obligation');
}

/* ------------------------------------------------ 10. delegation ------- */
section('10. CFO delegation of reviews');
{
  const users = (await http('/api/users', { as: 'cfo' })).data?.users || [];
  const officeId = users.find(x => x.email === ACTORS.office)?.id;
  const cr = await http('/api/delegations', { method: 'POST', as: 'cfo', json: {
    to_user_id: officeId, scope_type: 'country', scope_value: 'US',
    valid_from: '2026-07-01', valid_to: '2026-12-31', note: 'CFO office to clear the US queue' } });
  check(cr.status === 200 && cr.data?.id, 'CFO delegates review authority', `HTTP ${cr.status}`);

  const ls = await http('/api/delegations', { as: 'cfo' });
  check(ls.status === 200 && (ls.data?.delegations || []).length > 0, 'delegation list',
    `${ls.data?.delegations?.length} active`);

  await login('office', ACTORS.office);
  const dq = await http('/api/reviews', { as: 'office' });
  check(dq.status === 200, 'delegate can open a review queue', `${dq.data?.queue?.length} items`);

  check(in4xx((await http('/api/delegations', { method: 'POST', as: 'cfo',
    json: { to_user_id: officeId, scope_type: 'galaxy' } })).status), 'invalid delegation scope rejected');
  if (cr.data?.id)
    check((await http(`/api/delegations?id=${cr.data.id}`, { method: 'DELETE', as: 'cfo' })).status === 200, 'revoke a delegation');
}

/* -------------------------------------------- 11. user management ----- */
section('11. User management by email ID');
{
  const em = `smoke.tester.${Date.now().toString(36)}@suprajit.example`;
  const cr = await http('/api/users', { method: 'POST', as: 'cfo', json: {
    email: em, full_name: 'Smoke Tester', role_id: 'PREPARER',
    entities: ['E-US-01'], can_file: true, password: PW } });
  const uid = cr.data?.id;
  check(cr.status === 200 && uid, 'create a user from an email ID', `status=${cr.data?.status}`);
  check(cr.data?.status === 'pending', 'new account starts pending CFO approval');

  check((await login('smoke', em)).status === 401, 'cannot sign in before approval');
  check((await http('/api/users', { method: 'PATCH', as: 'cfo', json: { id: uid, status: 'active' } })).status === 200,
    'CFO approves the account');
  check((await login('smoke', em)).status === 200, 'approved user signs in');

  const se = [...new Set(((await http('/api/obligations?limit=2000', { as: 'smoke' })).data?.obligations || []).map(r => r.entity_id))];
  check(se.length === 1 && se[0] === 'E-US-01', 'new user scoped to the assigned entity only', `entities=${se.join(',')}`);
  check((await http('/api/users', { as: 'smoke' })).status === 403, 'new preparer has no admin rights');

  const rp = await http('/api/users', { method: 'PATCH', as: 'cfo', json: { id: uid, resetPassword: true } });
  check(rp.status === 200 && rp.data?.newPassword, 'reset password returns a new one');
  check((await login('smoke', em, rp.data?.newPassword)).status === 200, 'user signs in with the reset password');

  check((await http('/api/users', { method: 'PATCH', as: 'cfo', json: { id: uid, status: 'disabled' } })).status === 200, 'disable the user');
  check((await login('smoke', em, rp.data?.newPassword)).status === 401, 'disabled user is locked out');

  check((await http('/api/users', { method: 'POST', as: 'cfo',
    json: { email: em, full_name: 'Dupe', role_id: 'PREPARER', entities: ['E-US-01'] } })).status === 409,
    'duplicate email -> 409');
  check((await http('/api/users', { method: 'POST', as: 'cfo',
    json: { email: 'not-an-email', full_name: 'X', role_id: 'PREPARER', entities: ['E-US-01'] } })).status === 400,
    'malformed email -> 400');
  check((await http('/api/users', { method: 'POST', as: 'cfo',
    json: { email: `r.${Date.now()}@suprajit.example`, full_name: 'X', role_id: 'WIZARD', entities: ['E-US-01'] } })).status === 400,
    'unknown role -> 400');
  check((await http('/api/users', { method: 'POST', as: 'cfo',
    json: { email: `n.${Date.now()}@suprajit.example`, full_name: 'X', role_id: 'PREPARER', entities: [] } })).status === 400,
    'user with no entity assignment -> 400');

  const meId = (await http('/api/auth/me', { as: 'cfo' })).data?.user?.id;
  check(in4xx((await http('/api/users', { method: 'PATCH', as: 'cfo', json: { id: meId, status: 'disabled' } })).status),
    'CFO cannot disable their own account');

  await http(`/api/users?id=${uid}`, { method: 'DELETE', as: 'cfo' });
}

/* ------------------------------- 12. entities, calendar, audit -------- */
section('12. Entities, calendar, audit');
let EID = null;
{
  const es = await http('/api/entities', { as: 'cfo' });
  const rows = es.data?.entities || [];
  const scores = es.data?.scores || {};
  EID = rows[0]?.id;
  check(es.status === 200 && rows.length >= 14, 'entity list', `${rows.length} entities`);
  check(rows.every(e => typeof scores[e.id]?.score === 'number'), 'every entity carries a live score',
    rows.slice(0, 4).map(e => `${e.id}=${scores[e.id]?.score}`).join(' '));

  const d = await http(`/api/entities/${EID}`, { as: 'cfo' });
  check(d.status === 200, `entity detail (${EID})`, `HTTP ${d.status}`);
  const need = ['entity', 'score', 'states', 'byCategory', 'byStatus', 'obligations', 'recent', 'changes'];
  const miss = need.filter(k => !(k in (d.data || {})));
  check(!miss.length, 'entity page payload complete', miss.length ? 'missing ' + miss : `${need.length} blocks`);

  const us = await http('/api/entities/E-US-01', { as: 'cfo' });
  check((us.data?.states || []).length > 1, 'US entity shows its state jurisdictions',
    (us.data?.states || []).map(s => s.id ?? s.code ?? s).join(','));

  check((await http('/api/entities/E-NOPE', { as: 'cfo' })).status === 404, 'unknown entity -> 404');
  check((await http('/api/entities/E-IN-HQ', { as: 'preparer' })).status === 403, 'preparer cannot open another entity');

  const cal = await http('/api/calendar?year=2026&month=8', { as: 'cfo' });
  check(cal.status === 200 && Array.isArray(cal.data?.events), 'compliance calendar',
    `${cal.data?.events?.length} events in Aug 2026`);
  check((await http(`/api/calendar?year=2026&month=8&entity=${EID}`, { as: 'cfo' })).status === 200,
    'entity-specific compliance calendar');
  check((await http('/api/calendar?year=2026&month=8&country=US', { as: 'cfo' })).status === 200,
    'country-specific compliance calendar');
  check((await http('/api/calendar?year=abc&month=xyz', { as: 'cfo' })).status === 200, 'bad calendar params fall back safely');

  const au = await http('/api/audit?limit=50', { as: 'cfo' });
  check(au.status === 200 && (au.data?.entries || []).length > 0, 'audit log records this session',
    `${au.data?.entries?.length} entries`);
  if (au.data?.entries?.length) note(au.data.entries.slice(0, 6).map(e => e.action).join('  '));
}

/* ------------------------------------------------- 13. reports -------- */
section('13. Reports');
for (const r of ['country', 'entity', 'division', 'category', 'overdue', 'delay', 'evidence', 'reviewer', 'executive', 'board']) {
  const x = await http(`/api/reports/${r}?format=xlsx`, { as: 'cfo' });
  const j = await http(`/api/reports/${r}`, { as: 'cfo' });
  check(x.status === 200 && isXlsx(x.buf) && j.status === 200 && Array.isArray(j.data?.rows),
    `report ${r}`,
    `xlsx ${x.buf?.length || 0}B, ${j.data?.rows?.length} rows${j.data?.extraSheets?.length ? `, +${j.data.extraSheets.length} sheets` : ''}`);
}
check((await http('/api/reports/not-a-report', { as: 'cfo' })).status === 404, 'unknown report type -> 404');
check((await http('/api/reports/board', { as: 'preparer' })).status === 403, 'preparer cannot generate board reports');

/* --------------------------------------- 14. pages render ------------- */
section('14. Authenticated pages render');
for (const p of ['dashboard', 'entities', 'compliance', 'register', 'calendar', 'reviews', 'reports', 'admin']) {
  const r = await http('/' + p, { as: 'cfo' });
  const clean = !/MRL|Management Representation/i.test(r.text || '');
  check(r.status === 200 && clean, `/${p} renders clean`,
    r.status !== 200 ? `HTTP ${r.status}` : clean ? '' : 'contains MRL wording');
}
check((await http(`/entities/${EID}`, { as: 'cfo' })).status === 200, `/entities/${EID} renders`);
check((await http('/reviews', { as: 'reviewer' })).status === 200, '/reviews renders for a reviewer');
check((await http('/register', { as: 'preparer' })).status === 200, '/register renders for a preparer');

/* ------------------------------------------- 15. session -------------- */
section('15. Session lifecycle');
check((await http('/api/auth/logout', { method: 'POST', as: 'cfo' })).status === 200, 'logout 200');
check((await http('/api/dashboard', { as: 'cfo' })).status === 401, 'session invalid after logout');
await login('cfo', ACTORS.cfo);
check((await http('/api/dashboard', { as: 'cfo' })).status === 200, 'can sign back in');

/* ------------------------------------- 16. error handling ------------- */
section('16. Error handling (JSON, never an HTML 500)');
{
  const nf = await http(`/api/obligations/${NIL}`, { as: 'cfo' });
  check(nf.status === 404, 'unknown obligation -> 404', `HTTP ${nf.status}`);
  check(nf.ct.includes('json'), 'error body is JSON, not an HTML error page', nf.ct);
  const mal = await http('/api/obligations/not-a-uuid', { as: 'cfo' });
  check(in4xx(mal.status), 'malformed id -> 4xx', `HTTP ${mal.status} "${(mal.data?.error ?? '').slice(0, 50)}"`);
  check(in4xx((await http('/api/reviews', { method: 'POST', as: 'reviewer', json: {} })).status), 'empty review payload -> 4xx');
  check(in4xx((await http('/api/compliances/import', { method: 'POST', as: 'cfo', form: fd({}) })).status), 'import with no file -> 4xx');
  check((await http('/api/nope/nothing', { as: 'cfo' })).status === 404, 'unknown API path -> 404');
}

/* --------------------------------------------------------- result ---- */
console.log(`\n${B('='.repeat(60))}`);
console.log(`  passed: ${G(pass)}    failed: ${fail ? R(fail) : G(0)}`);
if (fail) { console.log(R('\n  Failures:')); failures.forEach(f => console.log(R('   - ' + f))); }
else console.log(G('\n  ALL CHECKS GREEN'));
console.log('');
process.exit(fail ? 1 : 0);
