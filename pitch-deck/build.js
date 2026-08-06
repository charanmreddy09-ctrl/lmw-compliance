const pptxgen = require('pptxgenjs');
const { iconPng, Fa } = require('./icons.js');

// ---------------------------------------------------------------- palette
const GRAPHITE_900 = '201C1B';
const GRAPHITE_800 = '2C2725';
const GRAPHITE_700 = '3D3633';
const GRAPHITE_600 = '574E49';
const GRAPHITE_400 = '8A8480';
const MUTED_ON_DARK = 'C9C2BE';
const LIGHT_BG = 'FFFFFF';
const CARD_TINT = 'F4F3F2';
const CARD_TINT_2 = 'ECEAE8';
const RED = '8E1B26';
const RED_DARK = '661016';
const RED_TINT = 'F3E3E4';
const WHITE = 'FFFFFF';

const HEAD_FONT = 'Cambria';
const BODY_FONT = 'Calibri';

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.6;

async function main() {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'WIDE', width: SLIDE_W, height: SLIDE_H });
  pres.layout = 'WIDE';

  // ------------------------------------------------------------ pre-render icons
  const iconNames = {
    shield: Fa.FaShieldAlt, file: Fa.FaFileAlt, question: Fa.FaQuestionCircle,
    search: Fa.FaSearch, warn: Fa.FaExclamationTriangle, clipboard: Fa.FaClipboardList,
    upload: Fa.FaUpload, checkDouble: Fa.FaCheckDouble, userCheck: Fa.FaUserCheck,
    chart: Fa.FaChartLine, university: Fa.FaUniversity, invoice: Fa.FaFileInvoiceDollar,
    building: Fa.FaBuilding, coins: Fa.FaCoins, balance: Fa.FaBalanceScale,
    sync: Fa.FaSyncAlt, book: Fa.FaBook, calendar: Fa.FaCalendarAlt,
    review: Fa.FaClipboardCheck, download: Fa.FaFileDownload, users: Fa.FaUsersCog,
    check: Fa.FaCheckCircle, times: Fa.FaTimesCircle, lock: Fa.FaLock,
    globe: Fa.FaGlobeAsia, handshake: Fa.FaHandshake, rocket: Fa.FaRocket,
    dashboard: Fa.FaTachometerAlt,
  };
  const icon = {};
  for (const [key, Comp] of Object.entries(iconNames)) {
    icon[key + 'White'] = await iconPng(Comp, WHITE, 256);
    icon[key + 'Red'] = await iconPng(Comp, RED, 256);
    icon[key + 'Graphite'] = await iconPng(Comp, GRAPHITE_700, 256);
  }

  // ------------------------------------------------------------ helpers
  function iconCircle(slide, key, x, y, d, { bg = RED, tone = 'White' } = {}) {
    slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color: bg }, line: { type: 'none' } });
    const pad = d * 0.26;
    slide.addImage({ data: icon[key + tone], x: x + pad / 2, y: y + pad / 2, w: d - pad, h: d - pad });
  }

  function sectionLabel(slide, text, x, y, color = RED) {
    slide.addText(text.toUpperCase(), {
      x, y, w: 6, h: 0.35, fontFace: BODY_FONT, fontSize: 12, bold: true,
      color, charSpacing: 2, align: 'left', margin: 0,
    });
  }

  function pageNumber(slide, n) {
    slide.addText(String(n).padStart(2, '0'), {
      x: SLIDE_W - 0.9, y: SLIDE_H - 0.5, w: 0.5, h: 0.3,
      fontFace: BODY_FONT, fontSize: 10, color: GRAPHITE_400, align: 'right', margin: 0,
    });
  }

  // ================================================================ SLIDE 1 — TITLE
  {
    const s = pres.addSlide();
    s.background = { color: GRAPHITE_900 };

    sectionLabel(s, 'Global Compliance Management Platform', MARGIN, 0.9, RED);

    s.addText('LMW Compliance\nManagement Platform', {
      x: MARGIN, y: 1.5, w: 11.2, h: 2.2, fontFace: HEAD_FONT, fontSize: 44, bold: true,
      color: WHITE, align: 'left', margin: 0, lineSpacingMultiple: 1.05,
    });

    s.addText('Statutory compliance the Board can rely on — because every entry is backed by the document that proves it.', {
      x: MARGIN, y: 3.75, w: 9.4, h: 0.9, fontFace: BODY_FONT, fontSize: 16, italic: true,
      color: MUTED_ON_DARK, align: 'left', margin: 0, lineSpacingMultiple: 1.3,
    });

    const stats = [
      { key: 'globe', v: '2', l: 'Countries live today' },
      { key: 'clipboard', v: '40+', l: 'Statutory obligations tracked' },
      { key: 'shield', v: '100%', l: 'Evidence-backed, not self-declared' },
    ];
    let sx = MARGIN;
    const gap = 0.5;
    const cardW = (11.2 - gap * 2) / 3;
    stats.forEach(st => {
      iconCircle(s, st.key, sx, 5.15, 0.6, { bg: RED });
      s.addText(st.v, {
        x: sx, y: 5.85, w: cardW, h: 0.55, fontFace: HEAD_FONT, fontSize: 28, bold: true,
        color: WHITE, margin: 0,
      });
      s.addText(st.l, {
        x: sx, y: 6.4, w: cardW, h: 0.5, fontFace: BODY_FONT, fontSize: 11.5,
        color: MUTED_ON_DARK, margin: 0, lineSpacingMultiple: 1.15,
      });
      sx += cardW + gap;
    });
  }

  // ================================================================ SLIDE 2 — THE PROBLEM
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'The Problem', MARGIN, 0.55);
    s.addText('Compliance today runs on trust, not proof', {
      x: MARGIN, y: 0.9, w: 7.6, h: 1.0, fontFace: HEAD_FONT, fontSize: 30, bold: true,
      color: GRAPHITE_900, margin: 0, lineSpacingMultiple: 1.05,
    });

    const rows = [
      { key: 'file', t: 'Scattered records', d: 'Due dates and filings live in spreadsheets across every country office.' },
      { key: 'question', t: 'Self-declared status', d: 'Compliance is confirmed by a representation letter, not by evidence.' },
      { key: 'search', t: 'No audit trail', d: "When something is questioned, there's no record of who reviewed what." },
      { key: 'warn', t: 'Missed or wrong dates', d: 'A single outdated due date can mean a real financial penalty.' },
    ];
    let ry = 2.15;
    rows.forEach(r => {
      iconCircle(s, r.key, MARGIN, ry, 0.55, { bg: RED });
      s.addText(r.t, {
        x: MARGIN + 0.8, y: ry - 0.03, w: 6.6, h: 0.35, fontFace: BODY_FONT, fontSize: 15,
        bold: true, color: GRAPHITE_900, margin: 0,
      });
      s.addText(r.d, {
        x: MARGIN + 0.8, y: ry + 0.32, w: 6.6, h: 0.5, fontFace: BODY_FONT, fontSize: 12.5,
        color: GRAPHITE_600, margin: 0, lineSpacingMultiple: 1.2,
      });
      ry += 1.15;
    });

    // right-side visual accent
    s.addShape('ellipse', { x: 9.3, y: 2.3, w: 3.2, h: 3.2, fill: { color: CARD_TINT }, line: { type: 'none' } });
    const bigPad = 3.2 * 0.32;
    s.addImage({ data: icon.warnRed, x: 9.3 + bigPad / 2, y: 2.3 + bigPad / 2, w: 3.2 - bigPad, h: 3.2 - bigPad });
    s.addText('Unverifiable\nby design', {
      x: 9.0, y: 5.65, w: 3.8, h: 0.7, fontFace: BODY_FONT, fontSize: 12, italic: true,
      color: GRAPHITE_600, align: 'center', margin: 0, lineSpacingMultiple: 1.15,
    });
    pageNumber(s, 2);
  }

  // ================================================================ SLIDE 3 — THE SOLUTION
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'The Platform');
    s.addText('One system of record for every statutory obligation', {
      x: MARGIN, y: 0.9, w: 10.8, h: 0.9, fontFace: HEAD_FONT, fontSize: 30, bold: true,
      color: GRAPHITE_900, margin: 0,
    });
    s.addText('It replaces the representation letter. Instead of asking each country to confirm it complied, the platform holds the filing, the evidence and the reviewer’s decision — and derives a live score from that record.', {
      x: MARGIN, y: 1.85, w: 10.8, h: 0.9, fontFace: BODY_FONT, fontSize: 14,
      color: GRAPHITE_600, margin: 0, lineSpacingMultiple: 1.35,
    });

    const stats = [
      { key: 'globe', v: '2', l: 'Entities in scope\nLMW Limited (India) and\nLMW Global FZE (UAE)' },
      { key: 'clipboard', v: '40+', l: 'Statutory obligations\nNational plus state / free-zone\nlevel — starting baseline' },
      { key: 'file', v: 'Every filing', l: 'Evidence held\nVersioned, checksummed,\ndownloadable' },
      { key: 'shield', v: 'Approved only', l: 'Score basis\nSelf-declaration\ndoes not count' },
    ];
    let sx = MARGIN;
    const gap = 0.35;
    const cardW = (12.13 - gap * 3) / 4;
    stats.forEach(st => {
      s.addShape('roundRect', {
        x: sx, y: 3.15, w: cardW, h: 3.3, rectRadius: 0.08,
        fill: { color: CARD_TINT }, line: { type: 'none' },
      });
      iconCircle(s, st.key, sx + (cardW - 0.65) / 2, 3.5, 0.65, { bg: RED });
      s.addText(st.v, {
        x: sx + 0.15, y: 4.35, w: cardW - 0.3, h: 0.5, fontFace: HEAD_FONT, fontSize: 20, bold: true,
        color: RED, align: 'center', margin: 0,
      });
      s.addText(st.l, {
        x: sx + 0.15, y: 4.95, w: cardW - 0.3, h: 1.35, fontFace: BODY_FONT, fontSize: 10.5,
        color: GRAPHITE_600, align: 'center', margin: 0, lineSpacingMultiple: 1.25,
      });
      sx += cardW + gap;
    });
    pageNumber(s, 3);
  }

  // ================================================================ SLIDE 4 — HOW IT WORKS (pipeline)
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'How It Works');
    s.addText('From obligation to score — with an audit trail at every step', {
      x: MARGIN, y: 0.9, w: 11.5, h: 0.7, fontFace: HEAD_FONT, fontSize: 27, bold: true,
      color: GRAPHITE_900, margin: 0,
    });

    const steps = [
      { key: 'clipboard', n: '01', t: 'Obligation raised', d: 'The library and the entity’s registered jurisdictions decide what applies.' },
      { key: 'upload', n: '02', t: 'Filed with evidence', d: 'The preparer uploads the filing and its supporting document.' },
      { key: 'checkDouble', n: '03', t: 'Validated automatically', d: 'Period, filing date, delay, penalty and duplicates are checked first.' },
      { key: 'userCheck', n: '04', t: 'Reviewed', d: 'It lands in the reviewer’s queue — approve, reject or query.' },
      { key: 'chart', n: '05', t: 'Scored', d: 'Only approved, evidence-backed obligations lift the score.' },
    ];
    const top = 2.35;
    const cardW = 2.05;
    const gap = 0.28;
    const totalW = cardW * 5 + gap * 4;
    let sx = (SLIDE_W - totalW) / 2;
    steps.forEach((st, i) => {
      s.addShape('roundRect', {
        x: sx, y: top, w: cardW, h: 3.9, rectRadius: 0.08,
        fill: { color: i === steps.length - 1 ? RED_TINT : CARD_TINT }, line: { type: 'none' },
      });
      s.addText(st.n, {
        x: sx + 0.15, y: top + 0.18, w: cardW - 0.3, h: 0.4, fontFace: HEAD_FONT, fontSize: 16, bold: true,
        color: GRAPHITE_400, margin: 0,
      });
      iconCircle(s, st.key, sx + (cardW - 0.7) / 2, top + 0.65, 0.7, { bg: RED });
      s.addText(st.t, {
        x: sx + 0.12, y: top + 1.55, w: cardW - 0.24, h: 0.65, fontFace: BODY_FONT, fontSize: 13, bold: true,
        color: GRAPHITE_900, align: 'center', margin: 0, lineSpacingMultiple: 1.1,
      });
      s.addText(st.d, {
        x: sx + 0.15, y: top + 2.25, w: cardW - 0.3, h: 1.5, fontFace: BODY_FONT, fontSize: 9.5,
        color: GRAPHITE_600, align: 'center', margin: 0, lineSpacingMultiple: 1.25,
      });
      if (i < steps.length - 1) {
        s.addText('›', {
          x: sx + cardW, y: top + 1.55, w: gap, h: 0.5, fontFace: BODY_FONT, fontSize: 22, bold: true,
          color: GRAPHITE_400, align: 'center', margin: 0,
        });
      }
      sx += cardW + gap;
    });

    s.addText('The number cannot be self-declared — it is derived, every time, from this record.', {
      x: MARGIN, y: 6.55, w: 11.5, h: 0.5, fontFace: BODY_FONT, fontSize: 13, italic: true,
      color: GRAPHITE_600, align: 'center', margin: 0,
    });
    pageNumber(s, 4);
  }

  // ================================================================ SLIDE 5 — WHERE THE DATES COME FROM
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'Data Sources');
    s.addText('Every due date traces back to an official source', {
      x: MARGIN, y: 0.9, w: 11, h: 0.7, fontFace: HEAD_FONT, fontSize: 28, bold: true,
      color: GRAPHITE_900, margin: 0,
    });

    const sources = [
      { key: 'university', t: 'Income Tax Department', d: 'incometaxindia.gov.in — Direct Tax, including the new Income-tax Act, 2025 renumbering' },
      { key: 'invoice', t: 'GST Portal', d: 'gst.gov.in — GSTR-1, GSTR-3B, GSTR-9 / 9C filing calendar' },
      { key: 'building', t: 'MCA / ROC Calendar', d: 'Ministry of Corporate Affairs — AOC-4, MGT-7, DIR-3 KYC and more' },
      { key: 'coins', t: 'Reserve Bank of India', d: 'FEMA filings — FLA return, Overseas Direct Investment reporting' },
      { key: 'balance', t: 'SEBI / LODR Calendar', d: 'Listing regulations — quarterly results, shareholding, governance' },
    ];
    const cols = 3;
    const gapX = 0.35, gapY = 0.35;
    const cardW = (12.13 - gapX * (cols - 1)) / cols;
    const cardH = 1.75;
    sources.forEach((src, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = MARGIN + col * (cardW + gapX);
      const y = 2.05 + row * (cardH + gapY);
      s.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: CARD_TINT }, line: { type: 'none' } });
      iconCircle(s, src.key, x + 0.25, y + 0.25, 0.55, { bg: RED });
      s.addText(src.t, {
        x: x + 0.95, y: y + 0.2, w: cardW - 1.1, h: 0.55, fontFace: BODY_FONT, fontSize: 12.5, bold: true,
        color: GRAPHITE_900, margin: 0, lineSpacingMultiple: 1.1,
      });
      s.addText(src.d, {
        x: x + 0.25, y: y + 0.85, w: cardW - 0.5, h: 0.8, fontFace: BODY_FONT, fontSize: 9.5,
        color: GRAPHITE_600, margin: 0, lineSpacingMultiple: 1.2,
      });
    });

    // highlight callout card in the 6th grid position
    const hx = MARGIN + 2 * (cardW + gapX);
    const hy = 2.05 + 1 * (cardH + gapY);
    s.addShape('roundRect', { x: hx, y: hy, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: RED }, line: { type: 'none' } });
    iconCircle(s, 'sync', hx + 0.25, hy + 0.25, 0.55, { bg: WHITE, tone: 'Red' });
    s.addText('Due-date sync', {
      x: hx + 0.95, y: hy + 0.2, w: cardW - 1.1, h: 0.55, fontFace: BODY_FONT, fontSize: 12.5, bold: true,
      color: WHITE, margin: 0,
    });
    s.addText('Automatically re-checks sources and flags any change — an admin approves before anything updates.', {
      x: hx + 0.25, y: hy + 0.85, w: cardW - 0.5, h: 0.8, fontFace: BODY_FONT, fontSize: 9.5,
      color: MUTED_ON_DARK, margin: 0, lineSpacingMultiple: 1.2,
    });
    pageNumber(s, 5);
  }

  // ================================================================ SLIDE 6 — KEY MODULES
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'Inside The Platform');
    s.addText('Seven modules. Nothing that is not used.', {
      x: MARGIN, y: 0.9, w: 11, h: 0.7, fontFace: HEAD_FONT, fontSize: 28, bold: true,
      color: GRAPHITE_900, margin: 0,
    });

    const mods = [
      { key: 'dashboard', t: 'Dashboard', d: 'Group, country and category score in one filterable view.' },
      { key: 'building', t: 'Entities', d: 'Every legal entity with its own scorecard and obligation register.' },
      { key: 'book', t: 'Compliance Library', d: 'The statutory master list — editable, importable from Excel.' },
      { key: 'calendar', t: 'Compliance Calendar', d: 'Day, 15-day and month views of what falls due.' },
      { key: 'review', t: 'Reviews', d: 'Approve, reject, query or reassign every filing.' },
      { key: 'download', t: 'Reports', d: 'Country, entity and reviewer reports, exportable to Excel.' },
      { key: 'users', t: 'Administration', d: 'Users, roles, delegation and the full audit trail.' },
    ];
    const cols = 4;
    const gapX = 0.3, gapY = 0.35;
    const cardW = (12.13 - gapX * (cols - 1)) / cols;
    const cardH = 1.95;
    mods.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = MARGIN + col * (cardW + gapX);
      const y = 2.05 + row * (cardH + gapY);
      s.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: CARD_TINT }, line: { type: 'none' } });
      iconCircle(s, m.key, x + (cardW - 0.55) / 2, y + 0.22, 0.55, { bg: RED });
      s.addText(m.t, {
        x: x + 0.15, y: y + 0.95, w: cardW - 0.3, h: 0.35, fontFace: BODY_FONT, fontSize: 12, bold: true,
        color: GRAPHITE_900, align: 'center', margin: 0,
      });
      s.addText(m.d, {
        x: x + 0.15, y: y + 1.28, w: cardW - 0.3, h: 0.65, fontFace: BODY_FONT, fontSize: 9,
        color: GRAPHITE_600, align: 'center', margin: 0, lineSpacingMultiple: 1.2,
      });
    });
    pageNumber(s, 6);
  }

  // ================================================================ SLIDE 7 — BEFORE / AFTER
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'Why It Works');
    s.addText('Replaces the representation letter with proof', {
      x: MARGIN, y: 0.9, w: 11, h: 0.7, fontFace: HEAD_FONT, fontSize: 28, bold: true,
      color: GRAPHITE_900, margin: 0,
    });

    const colW = 5.6;
    const leftX = MARGIN;
    const rightX = SLIDE_W - MARGIN - colW;
    const top = 2.05;
    const colH = 4.75;

    s.addShape('roundRect', { x: leftX, y: top, w: colW, h: colH, rectRadius: 0.08, fill: { color: CARD_TINT }, line: { type: 'none' } });
    s.addShape('roundRect', { x: rightX, y: top, w: colW, h: colH, rectRadius: 0.08, fill: { color: GRAPHITE_900 }, line: { type: 'none' } });

    s.addText('BEFORE', { x: leftX + 0.35, y: top + 0.3, w: colW - 0.7, h: 0.4, fontFace: BODY_FONT, fontSize: 13, bold: true, color: GRAPHITE_600, charSpacing: 2, margin: 0 });
    s.addText('AFTER', { x: rightX + 0.35, y: top + 0.3, w: colW - 0.7, h: 0.4, fontFace: BODY_FONT, fontSize: 13, bold: true, color: RED, charSpacing: 2, margin: 0 });

    const before = ['Self-declared compliance status', 'No audit trail behind the number', 'Manual, spreadsheet-based date tracking', 'Filing dates entered and re-entered by hand'];
    const after = ['Evidence required before anything counts', 'Full audit trail for every decision', 'Due dates checked against official sources', 'Filing date read automatically from the document'];

    let by = top + 0.9;
    before.forEach(t => {
      s.addImage({ data: icon.timesGraphite, x: leftX + 0.35, y: by, w: 0.32, h: 0.32 });
      s.addText(t, { x: leftX + 0.85, y: by - 0.06, w: colW - 1.2, h: 0.6, fontFace: BODY_FONT, fontSize: 12.5, color: GRAPHITE_700, margin: 0, lineSpacingMultiple: 1.2 });
      by += 0.95;
    });
    let ay = top + 0.9;
    after.forEach(t => {
      s.addImage({ data: icon.checkRed, x: rightX + 0.35, y: ay, w: 0.32, h: 0.32 });
      s.addText(t, { x: rightX + 0.85, y: ay - 0.06, w: colW - 1.2, h: 0.6, fontFace: BODY_FONT, fontSize: 12.5, color: WHITE, margin: 0, lineSpacingMultiple: 1.2 });
      ay += 0.95;
    });
    pageNumber(s, 7);
  }

  // ================================================================ SLIDE 8 — COVERAGE TODAY
  {
    const s = pres.addSlide();
    s.background = { color: LIGHT_BG };
    sectionLabel(s, 'Proven, Extensible');
    s.addText('Live today across two countries — built for any number', {
      x: MARGIN, y: 0.9, w: 11.2, h: 0.8, fontFace: HEAD_FONT, fontSize: 28, bold: true,
      color: GRAPHITE_900, margin: 0,
    });
    s.addText('A state or free-zone obligation applies to an entity only where it is actually registered. Add further countries, states or entities at any time — no code change required.', {
      x: MARGIN, y: 1.85, w: 11.2, h: 0.7, fontFace: BODY_FONT, fontSize: 13.5,
      color: GRAPHITE_600, margin: 0, lineSpacingMultiple: 1.3,
    });

    const cards = [
      { flag: 'IN', country: 'India', sub: 'Central corporate law, tax, GST, SEBI / LODR and FEMA, plus Tamil Nadu professional tax, labour welfare, factory licence, boiler certificate and pollution control.' },
      { flag: 'AE', country: 'United Arab Emirates', sub: 'Federal VAT, Corporate Tax, Economic Substance and UBO filings, plus Dubai free-zone trade licence, immigration and financial statement filings.' },
    ];
    let cx = MARGIN;
    const cw = 5.6;
    cards.forEach(c => {
      s.addShape('roundRect', { x: cx, y: 2.85, w: cw, h: 2.2, rectRadius: 0.08, fill: { color: CARD_TINT }, line: { type: 'none' } });
      s.addText(c.flag, {
        x: cx + 0.3, y: 3.05, w: 1.2, h: 0.6, fontFace: HEAD_FONT, fontSize: 22, bold: true, color: RED, margin: 0,
      });
      s.addText(c.country, {
        x: cx + 0.3, y: 3.6, w: cw - 0.6, h: 0.4, fontFace: BODY_FONT, fontSize: 15, bold: true, color: GRAPHITE_900, margin: 0,
      });
      s.addText(c.sub, {
        x: cx + 0.3, y: 4.05, w: cw - 0.6, h: 0.9, fontFace: BODY_FONT, fontSize: 10.5, color: GRAPHITE_600, margin: 0, lineSpacingMultiple: 1.25,
      });
      cx += cw + 0.4;
    });

    const stats = [
      { v: '2', l: 'Countries live' },
      { v: '40+', l: 'Obligations tracked' },
      { v: '0', l: 'Code changes to add one more' },
    ];
    let sx = MARGIN;
    const sw = (11.2 - 0.4 * 2) / 3;
    stats.forEach(st => {
      s.addText(st.v, { x: sx, y: 5.4, w: sw, h: 0.6, fontFace: HEAD_FONT, fontSize: 30, bold: true, color: RED, align: 'center', margin: 0 });
      s.addText(st.l, { x: sx, y: 6.05, w: sw, h: 0.5, fontFace: BODY_FONT, fontSize: 11, color: GRAPHITE_600, align: 'center', margin: 0 });
      sx += sw + 0.4;
    });
    pageNumber(s, 8);
  }

  // ================================================================ SLIDE 9 — COMPETITIVE ADVANTAGE
  {
    const s = pres.addSlide();
    s.background = { color: GRAPHITE_900 };
    sectionLabel(s, 'The Advantage', MARGIN, 0.55, RED);
    s.addText('Built so the number can’t be gamed', {
      x: MARGIN, y: 0.9, w: 11, h: 0.8, fontFace: HEAD_FONT, fontSize: 30, bold: true, color: WHITE, margin: 0,
    });

    const adv = [
      { key: 'lock', t: 'Single source of truth', d: 'One record per obligation, per entity, per period — not a spreadsheet per country.' },
      { key: 'shield', t: 'Nothing counts without evidence', d: 'Approval plus a document is the only way an obligation lifts the score.' },
      { key: 'sync', t: 'Always current, always reviewed', d: 'Due dates are checked against official sources — changes wait for sign-off.' },
      { key: 'handshake', t: 'Built around your structure', d: 'Configured to your actual entities and jurisdictions, not a generic template.' },
    ];
    const cols = 2;
    const gapX = 0.5, gapY = 0.5;
    const cardW = (12.13 - gapX) / 2;
    const cardH = 1.9;
    adv.forEach((a, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = MARGIN + col * (cardW + gapX);
      const y = 2.15 + row * (cardH + gapY);
      s.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: GRAPHITE_800 }, line: { type: 'none' } });
      iconCircle(s, a.key, x + 0.3, y + 0.3, 0.6, { bg: RED });
      s.addText(a.t, {
        x: x + 1.1, y: y + 0.28, w: cardW - 1.4, h: 0.4, fontFace: BODY_FONT, fontSize: 14, bold: true, color: WHITE, margin: 0,
      });
      s.addText(a.d, {
        x: x + 1.1, y: y + 0.72, w: cardW - 1.4, h: 1.0, fontFace: BODY_FONT, fontSize: 11, color: MUTED_ON_DARK, margin: 0, lineSpacingMultiple: 1.25,
      });
    });
    pageNumber(s, 9);
  }

  // ================================================================ SLIDE 10 — CLOSING / CTA
  {
    const s = pres.addSlide();
    s.background = { color: GRAPHITE_900 };
    iconCircle(s, 'rocket', SLIDE_W / 2 - 0.5, 1.3, 1.0, { bg: RED });
    s.addText('Give your Board a number it can trust.', {
      x: MARGIN, y: 2.7, w: SLIDE_W - MARGIN * 2, h: 1.1, fontFace: HEAD_FONT, fontSize: 34, bold: true,
      color: WHITE, align: 'center', margin: 0,
    });
    s.addText('Let’s pilot the platform on your highest-risk entity first — live in weeks, not quarters.', {
      x: MARGIN + 1.5, y: 3.8, w: SLIDE_W - (MARGIN + 1.5) * 2, h: 0.7, fontFace: BODY_FONT, fontSize: 15, italic: true,
      color: MUTED_ON_DARK, align: 'center', margin: 0, lineSpacingMultiple: 1.3,
    });
    s.addText('LMW Compliance Management Platform  ·  Version 1.0', {
      x: MARGIN, y: SLIDE_H - 0.9, w: SLIDE_W - MARGIN * 2, h: 0.4, fontFace: BODY_FONT, fontSize: 11,
      color: GRAPHITE_400, align: 'center', margin: 0,
    });
  }

  const outPath = require('path').join(__dirname, 'LMW_Compliance_Platform_Pitch.pptx');
  await pres.writeFile({ fileName: outPath });
  console.log('Wrote', outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
