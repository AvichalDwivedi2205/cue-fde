// Generated from the supplied design by scripts/build-ui.mjs.
// Presentation only. No workspace data, API calls or product actions.
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => String(n).padStart(2, '0');
const P = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>', chevL: '<path d="m15 18-6-6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  xlogo: '<path fill="currentColor" stroke="none" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77zm-1.08 16.2h1.7L7.4 4.73H5.58z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 16l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-3"/><path d="m14 4-2 2 2 2"/>',
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  branch: '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="7" r="2.5"/><path d="M6 7.5v9M18 9.5c0 4.5-6 4-11.2 7.6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  arrowR: '<path d="M5 12h14M13 5l7 7-7 7"/>', arrowD: '<path d="M12 5v14M5 13l7 7 7-7"/>', arrowL: '<path d="M19 12H5M11 5l-7 7 7 7"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  slack: '<rect x="13" y="2" width="3" height="8" rx="1.5"/><rect x="8" y="14" width="3" height="8" rx="1.5"/><rect x="14" y="13" width="8" height="3" rx="1.5"/><rect x="2" y="8" width="8" height="3" rx="1.5"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v1M15 13v1M2 14h2M20 14h2"/>',
  widget: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 10h8M8 14h5"/>',
  cue: '<path d="M17.5 7.2A6.6 6.6 0 1 0 17.5 16.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  thumbDown: '<path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  micOff: '<path d="m2 2 20 20M18.89 13.23A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12M12 19v3"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
  wifiOff: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M12 20h.01"/>',
  headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  reddit: '<circle cx="12" cy="14" r="7"/><path d="M9.5 16.5c1.5 1 3.5 1 5 0"/><circle cx="9.5" cy="13" r=".6" fill="currentColor"/><circle cx="14.5" cy="13" r=".6" fill="currentColor"/><path d="m12 7 1.2-4 3.8 1"/><circle cx="18.3" cy="4.3" r="1.3"/>',
};
const ic = (n, s = 16, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c || 'currentColor'}" stroke-width="${n === 'cue' ? 3.2 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
// Brand mark (design/brand): the C and its signal dot. dark = white C, bright signal for Night surfaces.
const cueSymbol = (s = 22, dark = true) => `<svg class="cue-symbol" width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true"><path d="M52.79 16.05A34 34 0 1 0 79.52 73.99" fill="none" stroke="${dark ? '#fff' : '#14181A'}" stroke-width="20" stroke-linecap="round"/><circle cx="79.52" cy="25.9" r="11" fill="${dark ? '#3DD68C' : '#17A05E'}"/></svg>`;

const STORY = [
  { t: 'Every report, one inbox', d: 'Customers complain wherever they are: on X, in your app’s chat, by email. Cue catches each one, with its screenshots and context.', url: 'inbox', nav: 1 },
  { t: 'Cue sees it’s one problem', d: 'Three people, three channels, one bug. Cue groups them into a single issue, so you fix it once.', url: 'issues', nav: 2 },
  { t: 'Find out why, in one click', d: 'Cue reproduces the problem in a safe copy of your app and points to the exact cause.', url: 'issues / photo-uploads', nav: 2 },
  { t: 'You approve. Cue ships.', d: 'Cue writes the fix and runs the tests. Nothing goes live until you say so.', url: 'issues / photo-uploads / fix', nav: 2 },
  { t: 'Every customer hears back', d: 'Once the fix is live and checked, each person gets a reply where they first asked.', url: 'issues / photo-uploads', nav: 2 },
  { t: 'Then it grows', d: 'Cue finds people asking for what you just shipped and drafts a helpful reply. You post it.', url: 'growth', nav: 3 },
];
const K_AT = [0, .12, .28, .44, .6, .76];
const STAGE_W = 980, STAGE_H = 540;
// [chapter, first step it appears on, colour, text, arrow direction, top]
const ANN = [
  [0, 3, 'pink', 'From X, chat and email', 'dn', 118],
  [1, 3, 'blue', 'Three people, one problem', 'up', 214],
  [2, 1, 'pink', 'Find out what broke', 'up', 58],
  [3, 1, 'amber', 'You stay in control', 'dn', 404],
  [4, 3, 'green', 'Nobody chases anyone', 'up', 176],
  [5, 3, 'blue', 'Turn fixes into customers', 'dn', 368],
];
// Where the cursor points, per chapter and step. 'park' is a resting spot; a number marks the step that clicks.
const CUR = { 2: { 0: 'park', 1: '.sc2 .lbtn', click: 2 }, 3: { 0: 'park', 1: '.sc3 .lbtn', click: 2 }, 5: { 0: 'park', 2: '.sc5 .lbtn', click: 3 } };

const lAv = (ini, c) => `<span class="lav" style="background:${c}">${ini}</span>`;
const lCh = { x: ['xlogo', 'X'], chat: ['chat', 'In-app chat'], email: ['mail', 'Email'] };
const lRow = (ini, c, n, ch, tx, tm, cls = '') => `<div class="ib-r ${cls}"><div class="ib-in"><div class="ib-c">${lAv(ini, c)}<div class="ib-b"><div class="ib-t"><b>${n}</b><span class="ib-ch">${ic(lCh[ch][0], 10)}${lCh[ch][1]}</span><span class="ib-tm">${tm}</span></div><div class="ib-x">${tx}</div></div></div></div></div>`;
const R1 = ['MC', '#C2552F', 'Maya Chen', 'x', 'every photo from my phone gets rejected 😩 tried 3 times', 'now'];
const R2 = ['OP', '#3563C9', 'Oliver Park', 'chat', 'Your app says up to 5 MB, but my 3 MB photo won’t upload', '1m'];
const R3 = ['AP', '#8A5A2B', 'Aisha Patel', 'email', 'Uploading a 3.4 MB photo fails with error 413', '2m'];
const avStack = `<span class="lav-st">${lAv('MC', '#C2552F')}${lAv('OP', '#3563C9')}${lAv('AP', '#8A5A2B')}</span>`;
const spin = '<span class="lspin"></span>';

function sceneHTML(i) {
  if (i === 0) return `<div class="sc sc0" data-s="0"><div class="sc-h"><b>Inbox</b><span class="sc-tabs"><i class="on">All</i><i>Open</i><i>Waiting</i></span></div>
    <div class="ib">${lRow(...R1, 'nw n1')}${lRow(...R2, 'nw n2')}${lRow(...R3, 'nw n3')}${lRow('LM', '#6D4FC2', 'Leo Martin', 'chat', 'Can I export my journal as a PDF?', '2h', 'old')}${lRow('SR', '#B7791F', 'Sofia Rivera', 'email', 'Dark mode, please 🌙', '5h', 'old')}</div></div>`;
  if (i === 1) return `<div class="sc sc1" data-s="1"><div class="sc-h"><b>Inbox</b><span class="sc-tabs"><i class="on">All</i><i>Open</i><i>Waiting</i></span></div>
    <div class="ib mg">${lRow(...R1, 'm1')}${lRow(...R2, 'm2')}${lRow(...R3, 'm3')}</div>
    <div class="iss"><div class="iss-ic">${ic('bug', 16)}</div><div class="iss-b"><small>New issue</small><b>Photos above 2 MB fail to upload</b>
      <div class="iss-m"><span class="lchip red">Urgent</span>${avStack}<span>3 customers</span><span class="iss-chs">${ic('xlogo', 11)}${ic('chat', 11)}${ic('mail', 11)}</span></div>
      <div class="iss-one">${ic('check', 12)}One fix will answer all three</div></div></div></div>`;
  if (i === 2) return `<div class="sc sc2" data-s="2"><div class="is-h"><div><small>Issue</small><b>Photos above 2 MB fail to upload</b><div class="iss-m"><span class="lchip red">Urgent</span>${avStack}<span>3 customers</span></div></div>
      <button class="lbtn" tabindex="-1"><span class="l0">${ic('sparkle', 13)}Investigate</span><span class="l1">${spin}Investigating…</span><span class="l2">${ic('check', 13)}Done</span></button></div>
    <div class="st-wait"><span></span><span></span><span></span><p>Cue hasn’t looked at this yet</p></div>
    <div class="lst">
      <div class="st-r s1"><span class="st-i">${ic('check', 12)}</span><div><b>Reproduced in a safe copy of Bloom</b><p>A 3 MB photo fails, exactly like Maya’s.</p></div></div>
      <div class="st-r s2"><span class="st-i">${ic('check', 12)}</span><div><b>Found the cause</b><div class="st-cause"><span><small>The app promises</small><b>5 MB</b></span><i>≠</i><span><small>The server allows</small><b>2 MB</b></span></div></div></div>
      <div class="st-r s3"><span class="st-i">${ic('check', 12)}</span><div><b>Fix drafted</b><p>One line changed, with tests that prove it.</p></div></div>
    </div></div>`;
  if (i === 3) return `<div class="sc sc3" data-s="3"><div class="is-h"><div><small>Ready for your review</small><b>Fix for photo uploads</b></div><span class="lchip ok">${ic('check', 11)}3 tests passed</span></div>
    <div class="df"><div class="df-h">${ic('file', 12)}server/limits.mjs<span>+1 −1</span></div>
      <div class="df-l"><i>1</i><code>// largest photo a customer can upload</code></div>
      <div class="df-l ldel"><i>2</i><code>export const MAX_UPLOAD_BYTES = <u>2</u> * 1024 * 1024;</code></div>
      <div class="df-l ladd"><i>2</i><code>export const MAX_UPLOAD_BYTES = <u>5</u> * 1024 * 1024;</code></div></div>
    <div class="df-ck"><span>${ic('check', 12)}Maya’s 3 MB photo uploads in the test copy</span><span>${ic('check', 12)}Nothing else changed</span></div>
    <div class="dc"><span class="dc-t">Nothing goes live until you approve.</span><span class="dc-live">${ic('check', 13)}Live, and checked on the real app</span>
      <button class="lbtn green" tabindex="-1"><span class="l0">${ic('rocket', 13)}Approve &amp; deploy</span><span class="l1">${spin}Deploying…</span><span class="l2">${ic('check', 13)}Deployed</span></button></div></div>`;
  if (i === 4) {
    const rep = (r, msg, n) => `<div class="rp rp${n}">${lAv(r[0], r[1])}<div class="rp-b"><div class="ib-t"><b>${r[2]}</b><span class="ib-ch">${ic(lCh[r[3]][0], 10)}${lCh[r[3]][1]}</span></div><p>${msg}</p></div><span class="rp-s"><span class="a">Ready</span><span class="b">${ic('check', 11)}Sent</span></span></div>`;
    return `<div class="sc sc4" data-s="4"><div class="is-h"><div><small>Issue</small><b>Photos above 2 MB fail to upload</b><div class="iss-m"><span class="fx-st"><span class="a"><i class="d red"></i>Open</span><span class="b">${ic('check', 11)}Fixed</span></span><span>Replies go out where each person asked</span></div></div></div>
      <div class="rps">${rep(R1, 'Hi Maya, this is fixed. Photos up to 5 MB upload now. Thanks for telling us!', 1)}${rep(R2, 'Hi Oliver, your 3 MB photo will upload now. Sorry for the trouble.', 2)}${rep(R3, 'Hi Aisha, the 413 error is fixed. Try the upload again any time.', 3)}</div></div>`;
  }
  return `<div class="sc sc5" data-s="5"><div class="is-h"><div><small>Growth</small><b>People asking for what you just shipped</b></div><span class="lchip">${ic('xlogo', 10)}1 new</span></div>
    <div class="gw"><div class="gw-p">${lAv('RO', '#0F766E')}<div><div class="ib-t"><b>Rina Okafor</b><span class="ib-tm">@rinawrites · X · 38m</span></div><p>is there a journal app where you can actually search old captions? scrolling back 3 years to find one photo is killing me</p></div></div>
      <div class="gw-can">${ic('check', 12)}Bloom can help · <b>Search by caption</b> is live</div>
      <div class="gw-r"><small>Cue’s draft reply</small><p>Bloom does exactly this. Every caption is searchable, so a word you wrote years ago brings the memory right back.</p></div>
      <div class="gw-f"><span class="gw-sk">Skip</span><button class="lbtn" tabindex="-1"><span class="l0">${ic('send', 13)}Post reply</span><span class="l1">${spin}Posting…</span><span class="l2">${ic('check', 13)}Posted</span></button></div></div>
    <div class="gw-toast">${ic('sparkle', 13)}<span><b>Rina signed up for Bloom</b> from your reply</span></div></div>`;
}
function macHTML(only) {
  const navI = ['home', 'inbox', 'bug', 'trend', 'book'];
  const scenes = only == null ? STORY.map((_, i) => sceneHTML(i)).join('') : sceneHTML(only);
  const ch = only == null ? 0 : only;
  return `<div class="mac"><div class="mac-bar"><span class="mac-dots"><i></i><i></i><i></i></span><span class="mac-url">app.cue.so / <b class="mac-u">${STORY[ch].url}</b></span><span class="mac-live"><i></i>Bloom</span></div>
    <div class="mac-body"><div class="mac-sb"><span class="mac-logo">${cueSymbol(22)}</span>${navI.map((n, j) => `<span class="mac-ni ${j === STORY[ch].nav ? 'on' : ''}">${ic(n, 15)}</span>`).join('')}</div>
    <div class="mac-main">${scenes}</div></div></div>`;
}
const annHTML = ([ch, k, c, txt, dir, top]) => `<div class="ann ${c} ${dir}" data-ch="${ch}" data-k="${k}" style="top:${top}px"><svg viewBox="0 0 96 44" aria-hidden="true"><path d="${dir === 'up' ? 'M92 30 C 64 34, 34 26, 8 10' : 'M92 12 C 64 8, 34 16, 8 34'}"/><path d="${dir === 'up' ? 'M8 10 L20 10 M8 10 L13 21' : 'M8 34 L13 23 M8 34 L20 35'}"/></svg><span>${txt}</span></div>`;
function setSceneK(sc, k) { for (let j = 1; j <= 5; j++) sc.classList.toggle('k' + j, k >= j); }

let lsCh = -1, lsK = -1, lsFit = 1, lsInline = false, lsRaf = 0;
function lsLayout() {
  const box = $('.ls-stagebox'); if (!box || lsInline) return;
  const r = box.getBoundingClientRect();
  lsFit = Math.min(1.08, r.width / STAGE_W, r.height / STAGE_H);
  $('#ls-stage').style.setProperty('--fit', lsFit.toFixed(4));
}
function lsCursor(ch, k, prevCh, prevK) {
  const cur = $('#ls-cur'), stage = $('#ls-stage'), plan = CUR[ch];
  if (!plan) { cur.classList.remove('on'); return; }
  let target = 'park';
  for (let j = 0; j <= k; j++) if (plan[j]) target = plan[j];
  let x = 400, y = 470;
  if (target !== 'park') {
    const el = $(target, stage);
    if (el) { const sr = stage.getBoundingClientRect(), er = el.getBoundingClientRect(), s = sr.width / STAGE_W; x = (er.left - sr.left + er.width * .62) / s; y = (er.top - sr.top + er.height * .62) / s; }
  }
  cur.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  cur.classList.add('on');
  if (ch === prevCh && k >= plan.click && prevK < plan.click) { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); }
}
function lsSet(ch, k) {
  if (ch === lsCh && k === lsK) return;
  const prevCh = lsCh, prevK = lsK; lsCh = ch; lsK = k;
  const stage = $('#ls-stage');
  stage.dataset.ch = ch;
  $$('.sc', stage).forEach((sc, j) => { sc.classList.toggle('on', j === ch); setSceneK(sc, j < ch ? 5 : j > ch ? 0 : k); });
  $$('.ann', stage).forEach(a => a.classList.toggle('on', +a.dataset.ch === ch && k >= +a.dataset.k));
  if (ch !== prevCh) {
    $('.mac-u', stage).textContent = STORY[ch].url;
    $$('.mac-ni', stage).forEach((n, j) => n.classList.toggle('on', j === STORY[ch].nav));
    $$('#ls-copy .lc').forEach((c, j) => c.classList.toggle('on', j === ch));
    $$('#ls-steps button').forEach((b, j) => { b.classList.toggle('on', j === ch); b.classList.toggle('past', j < ch); b.setAttribute('aria-current', j === ch ? 'step' : 'false'); });
  }
  lsCursor(ch, k, prevCh, prevK);
}
function lsScroll() {
  lsRaf = 0;
  const h = document.documentElement;
  $('#progress').style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
  const nav = $('#lnav'); nav.classList.toggle('scrolled', h.scrollTop > 8);
  if (lsInline) return;
  const sec = $('#story'), r = sec.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, sec.offsetHeight - innerHeight)));
  const f = Math.min(STORY.length - .0001, p * STORY.length), ch = Math.floor(f), t = f - ch;
  let k = 0; K_AT.forEach((a, j) => { if (t >= a) k = j; });
  $('#ls-stage').style.setProperty('--z', (.94 + .06 * Math.min(1, Math.max(0, (innerHeight - r.top) / innerHeight - .6) / .4)).toFixed(4));
  $('#ls-steps').style.setProperty('--p', p.toFixed(4));
  lsSet(ch, k);
}
function initStory() {
  const stage = $('#ls-stage'); if (!stage) return;
  lsInline = REDUCE || matchMedia('(max-width: 960px)').matches;
  $('#ls-steps').innerHTML = `<span class="ls-track"><i></i></span>` + STORY.map((s, i) => `<button type="button" data-ch="${i}" aria-label="Chapter ${i + 1}: ${esc(s.t)}"><i></i></button>`).join('');
  $('#ls-copy').innerHTML = STORY.map((s, i) => `<div class="lc" data-i="${i}"><span class="lc-n">${pad(i + 1)} / ${pad(STORY.length)}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('');
  if (lsInline) {
    $('#story').classList.add('inline');
    $('#ls-inline').innerHTML = STORY.map((s, i) => `<article class="lsi"><span class="lc-n">${pad(i + 1)} / ${pad(STORY.length)}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p><div class="ls-stage mini" data-ch="${i}">${macHTML(i)}</div></article>`).join('');
    $$('#ls-inline .sc').forEach(sc => { sc.classList.add('on'); setSceneK(sc, 5); });
  } else {
    stage.innerHTML = macHTML() + ANN.map(annHTML).join('') + `<div class="lcur" id="ls-cur" aria-hidden="true"><svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 1.5 L2 17.5 L6.4 13.6 L9.3 20.2 L12.3 18.9 L9.5 12.4 L15.4 12.2 Z" fill="#14181A" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><i></i></div>`;
    $('#ls-steps').addEventListener('click', e => {
      const b = e.target.closest('button[data-ch]'); if (!b) return;
      const sec = $('#story'), top = sec.getBoundingClientRect().top + scrollY;
      scrollTo({ top: top + (+b.dataset.ch + .05) / STORY.length * (sec.offsetHeight - innerHeight) + 1, behavior: 'smooth' });
    });
    addEventListener('resize', () => { lsLayout(); lsK = -1; lsScroll(); });
    lsLayout(); lsSet(0, 0);
  }
  addEventListener('scroll', () => { if (!lsRaf) lsRaf = requestAnimationFrame(lsScroll); }, { passive: true });
  lsScroll();
  const la = $('#la-stage');
  if (la) {
    if (REDUCE || !('IntersectionObserver' in window)) la.classList.add('in');
    else { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { la.classList.add('in'); io.disconnect(); } }), { threshold: .35 }); io.observe(la); }
  }
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  const target = $(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
});
initStory();
})();
