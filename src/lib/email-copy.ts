// Notification emails: the words and the layout. Pure (no database, no env) so it is unit-tested.
// The sender (email.ts) loads who it is for, their workspace and the record the notification points at.

export type EmailContext = {
  first: string                       // recipient's first name
  customerSide: boolean               // a customer user (true) or Seven Billion staff
  workspace: string                   // "Nesma Group" for customers, "Seven Billion" for staff
  customer?: string | null            // the customer the record belongs to (shown to staff)
  details?: [string, string][]        // label → value rows, only fields the recipient may see
  stage?: string | null               // request stage, for the progress tracker
}

const STAGES = ['submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered']
const stageLabel = (s: string) => (s === 'uat' ? 'UAT' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

type Voice = { eyebrow: string; intro: string; subject: string; cta: string }

/** The tone for each kind of notification: a short label, a personal opening line, a subject and a button. */
export function voice(kind: string, title: string, c: EmailContext): Voice {
  const who = c.customer && !c.customerSide ? c.customer : c.workspace
  const t = clip(title, 90)
  switch (kind) {
    case 'approval.requested':
      return { eyebrow: 'Your call', intro: `Hi ${c.first}, the team needs your OK before they set sail on this one. It takes about a minute.`, subject: `Your call, ${c.first}: ${t}`, cta: 'Review and approve' }
    case 'approval.resubmitted':
      return { eyebrow: 'Round two', intro: `Hi ${c.first}, we took your comments on board and sent a revised version.`, subject: `Round two: ${t}`, cta: 'Review the revision' }
    case 'approval.approved':
      return { eyebrow: 'Green light', intro: `Good news, ${c.first}. It is approved, so the work can go ahead.`, subject: `Green light: ${t}`, cta: 'Open in Helm' }
    case 'approval.changes_requested':
      return { eyebrow: 'Back to the drawing board', intro: `Hi ${c.first}, the customer asked for changes. Their comment is below.`, subject: `Changes requested: ${t}`, cta: 'See the comments' }
    case 'action.assigned':
      return { eyebrow: 'Over to you', intro: `Hi ${c.first}, there is one thing on your side. Here are the details.`, subject: `Over to you, ${c.first}: ${t.replace(/^Action for you: /, '')}`, cta: 'Open my actions' }
    case 'task.assigned':
      return { eyebrow: 'Fresh off the plan', intro: `Hi ${c.first}, this one now has your name on it.`, subject: `Fresh off the plan: ${t.replace(/^Task for you: /, '')}`, cta: 'Open the task' }
    case 'request.submitted':
      return { eyebrow: `New ask from ${who}`, intro: `Hi ${c.first}, ${who} has asked for something. Have a look today so they know it is in hand.`, subject: `New ask from ${who}: ${t}`, cta: 'Open the request' }
    case 'request.logged':
      return { eyebrow: 'We wrote it down', intro: `Hi ${c.first}, we noted what you asked for, so nothing gets lost. You can follow every step and reply in Helm.`, subject: `We wrote it down: ${t.replace(/^We logged your request: /, '')}`, cta: 'Follow it in Helm' }
    case 'request.status':
      return { eyebrow: c.stage === 'delivered' ? 'Land ahoy' : 'On the move', intro: c.stage === 'delivered' ? `Hi ${c.first}, it is delivered. Have a look and tell us how we did.` : `Hi ${c.first}, your request just moved a step forward.`, subject: t, cta: 'See progress' }
    case 'request.critical':
      return { eyebrow: 'All hands', intro: `Hi ${c.first}, a critical request came in from ${who}. It needs eyes today.`, subject: `Critical: ${t}`, cta: 'Open the request' }
    case 'project.at_risk':
      return { eyebrow: 'Choppy waters', intro: `Hi ${c.first}, a project has been marked At risk. Here is where it stands.`, subject: `Choppy waters: ${t}`, cta: 'Open the project' }
    case 'update.published':
      return { eyebrow: 'Your weekly update', intro: `Hi ${c.first}, here is the week on your project, in about a minute.`, subject: t, cta: 'Read the update' }
    case 'comment.mention':
      return { eyebrow: 'You were mentioned', intro: `Hi ${c.first}, someone asked for you by name.`, subject: t, cta: 'Reply in Helm' }
    case 'csat.request': case 'csat.pulse':
      return { eyebrow: 'Ten seconds, one number', intro: `Hi ${c.first}, how are we doing? One click on a 1 to 5 scale helps us steer.`, subject: `Ten seconds, ${c.first}? ${t}`, cta: 'Give a rating' }
    case 'time.returned':
      return { eyebrow: 'Quick fix needed', intro: `Hi ${c.first}, some of your logged time came back with a note. Delete the entry in My Work and log it again.`, subject: `Quick fix: ${t}`, cta: 'Open My Work' }
    case 'billing':
      return { eyebrow: 'Numbers to check', intro: `Hi ${c.first}, there is something in Billing for you to look at.`, subject: t, cta: 'Open Billing' }
    default:
      return { eyebrow: c.workspace, intro: `Hi ${c.first},`, subject: t, cta: 'Open in Helm' }
  }
}

// ---------------------------------------------------------------- the look

type Mood = 'inky' | 'peacock' | 'turq' | 'terra' | 'berry'
// banner colour, eyebrow pill, eyebrow text, intro text. Solid colours only: Outlook ignores transparency.
const MOODS: Record<Mood, { bg: string; pill: string; pillText: string; soft: string }> = {
  inky: { bg: '#13343b', pill: '#24505a', pillText: '#8fe3ee', soft: '#cfe3e6' },
  peacock: { bg: '#2e575d', pill: '#42707a', pillText: '#c9f1f5', soft: '#d9eaec' },
  turq: { bg: '#208090', pill: '#3b98a6', pillText: '#ffffff', soft: '#e2f4f6' },
  terra: { bg: '#a94b31', pill: '#bf6449', pillText: '#fed2a5', soft: '#f8e3da' },
  berry: { bg: '#954455', pill: '#a95e6e', pillText: '#fed2a5', soft: '#f6e1e5' },
}

type Look = { mood: Mood; badge: string; ps?: string; signoff: string }

/** Colour, icon, a P.S. and a sign-off for each kind. Badge files come from scripts/email-art.mjs. */
export function look(kind: string, c: EmailContext): Look {
  switch (kind) {
    case 'approval.requested':
      return { mood: 'inky', badge: 'compass-inky', signoff: 'Fair winds', ps: 'Not sure yet? Ask a question on the approval. Nothing moves until you decide.' }
    case 'approval.resubmitted':
      return { mood: 'inky', badge: 'compass-inky', signoff: 'Fair winds', ps: 'Still not right? Send it back with a note. There is no limit on rounds.' }
    case 'approval.approved':
      return { mood: 'turq', badge: 'flag-turq', signoff: 'Full steam ahead', ps: 'The decision, and who made it, is saved on the approval.' }
    case 'approval.changes_requested':
      return { mood: 'peacock', badge: 'reply-peacock', signoff: 'Back at it', ps: 'When the revision is ready, resubmit it from the approval page.' }
    case 'action.assigned':
      return { mood: 'inky', badge: 'hand-inky', signoff: 'Thanks for steering', ps: 'Done it already? Mark it complete in Helm so the team knows.' }
    case 'task.assigned':
      return { mood: 'peacock', badge: 'wheel-peacock', signoff: 'Steady as she goes', ps: 'Log your days against it from My Work as you go.' }
    case 'request.submitted':
      return { mood: 'peacock', badge: 'bottle-peacock', signoff: 'Hands on deck', ps: 'A quick reply today, even "on it", goes a long way.' }
    case 'request.logged':
      return { mood: 'peacock', badge: 'pencil-peacock', signoff: 'Noted and on board', ps: 'Did we get something wrong? Reply on the request and we will fix it.' }
    case 'request.status':
      return c.stage === 'delivered'
        ? { mood: 'turq', badge: 'anchor-turq', signoff: 'Anchors down', ps: 'Tell us how we did. One rating, ten seconds.' }
        : { mood: 'peacock', badge: 'sailboat-peacock', signoff: 'Onwards', ps: 'Every step, with dates, is on the request page.' }
    case 'request.critical':
      return { mood: 'terra', badge: 'siren-terra', signoff: 'All hands', ps: 'Say who is on it in the request thread, so the customer sees it is moving.' }
    case 'project.at_risk':
      return { mood: 'terra', badge: 'wind-terra', signoff: 'Hold the course', ps: 'Add the reason and the next step to the project, so the weekly update tells the same story.' }
    case 'update.published':
      return { mood: 'turq', badge: 'telescope-turq', signoff: 'Until next week', ps: 'Questions about the update? Reply on it in Helm and the team will see it.' }
    case 'comment.mention':
      return { mood: 'inky', badge: 'at-inky', signoff: 'Over and out', ps: 'Replying in Helm keeps the whole thread in one place.' }
    case 'csat.request': case 'csat.pulse':
      return { mood: 'berry', badge: 'star-berry', signoff: 'With thanks', ps: 'Comments are optional, but we read every one.' }
    case 'time.returned':
      return { mood: 'peacock', badge: 'pencil-peacock', signoff: 'Thanks for keeping the log straight', ps: 'Approved days fill the billing statement, so getting them right saves a round trip later.' }
    case 'billing':
      return { mood: 'peacock', badge: 'receipt-peacock', signoff: 'Steady hands on the wheel' }
    default:
      return { mood: 'inky', badge: 'wheel-inky', signoff: 'Steady hands on the wheel' }
  }
}

const SERIF = "Newsreader,Georgia,'Times New Roman',serif"
const SANS = "'IBM Plex Sans',Arial,Helvetica,sans-serif"
// the record's identity goes on one line at the top of the ticket; everything else becomes a big fact
const REF_KEYS = ['Request', 'Project']

/** The progress bar: nine stages, the ones reached filled in, the current one picked out. Plain tables, so every client shows it. */
function tracker(stage: string) {
  const at = STAGES.indexOf(stage)
  if (at < 0) return ''
  const cells = STAGES.map((s, i) => `<td title="${esc(stageLabel(s))}" style="height:${i === at ? 10 : 6}px;background:${i < at ? '#208090' : i === at ? '#20b8cd' : '#dbe4e6'};border-radius:5px;font-size:0;line-height:0">&nbsp;</td>`).join('<td style="width:4px;font-size:0">&nbsp;</td>')
  const next = STAGES[at + 1]
  return `<tr><td style="padding:4px 28px 18px">
<div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6a8288;margin-bottom:8px">The voyage so far</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr style="vertical-align:middle">${cells}</tr></table>
<div style="font-size:13px;color:#5b6b70;margin-top:8px">Step ${at + 1} of ${STAGES.length}: <b style="color:#13343b">${esc(stageLabel(stage))}</b>${next ? ` <span style="color:#8aa0a5">&nbsp;·&nbsp; next up: ${esc(stageLabel(next))}</span>` : ' <span style="color:#208090">&nbsp;·&nbsp; journey complete</span>'}</div></td></tr>`
}

/** The details as a ticket: the record's name across the top, then the facts in large type. */
function ticket(rows: [string, string][], color: string) {
  if (!rows.length) return ''
  const ref = rows.filter(([k]) => REF_KEYS.includes(k)).map(([, v]) => esc(v)).join(' &nbsp;·&nbsp; ')
  const facts = rows.filter(([k]) => !REF_KEYS.includes(k))
  const per = facts.length === 4 ? 2 : Math.min(3, facts.length)
  const lines: string[] = []
  for (let i = 0; i < facts.length; i += per) {
    const row = facts.slice(i, i + per)
    lines.push(`<tr>${row.map(([k, v], j) => `<td width="${Math.floor(100 / per)}%" style="padding:12px 16px;vertical-align:top;${j ? 'border-left:1px solid #e2eaec;' : ''}">
<div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6a8288">${esc(k)}</div>
<div style="font-size:19px;font-weight:700;color:#13343b;margin-top:3px;line-height:1.25">${esc(v)}</div></td>`).join('')}${row.length < per ? `<td colspan="${per - row.length}" style="border-left:1px solid #e2eaec"></td>` : ''}</tr>`)
  }
  return `<tr><td style="padding:6px 28px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbe6e8;border-left:5px solid ${color};border-radius:10px;background:#fbfdfd">
${ref ? `<tr><td colspan="${per || 1}" style="padding:11px 16px;background:#f2f8f8;border-bottom:1px dashed #c4d8db;border-radius:0 10px 0 0;font-size:13px;font-weight:600;color:#2e575d">${ref}</td></tr>` : ''}
${lines.join('<tr><td colspan="' + per + '" style="border-top:1px dashed #dbe6e8;font-size:0;line-height:0">&nbsp;</td></tr>')}
</table></td></tr>`
}

// messages people wrote read as a quote; system summaries as plain text
const QUOTED = ['approval.changes_requested', 'comment.mention', 'time.returned']

export function composeEmail({ kind, title, body, link, c, siteOrigin, to }: {
  kind: string; title: string; body: string; link: string; c: EmailContext; siteOrigin: string; to: string
}) {
  const v = voice(kind, title, c)
  const l = look(kind, c)
  const m = MOODS[l.mood]
  const rows = (c.details ?? []).filter(([k, val]) => val && !(k === 'Stage' && c.stage))
  // these bodies only summarise the record ("Effort 3 days. Target Oct 16."); the ticket already says it
  const summaryOnly = rows.length > 0 && ['approval.requested', 'action.assigned', 'task.assigned', 'request.submitted', 'request.critical'].includes(kind)
  const shown = summaryOnly ? '' : body
  const paragraphs = shown ? shown.split(/\n+/).map((p) => `<p style="margin:0 0 10px">${esc(p)}</p>`).join('') : ''
  const bodyHtml = !paragraphs ? '' : QUOTED.includes(kind)
    ? `<tr><td style="padding:2px 28px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid #20b8cd;padding:4px 0 4px 16px;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.55;color:#2e575d">${paragraphs}</td></tr></table></td></tr>`
    : `<tr><td style="padding:2px 28px 12px;font-size:14px;line-height:1.6;color:#4a5b60">${paragraphs}</td></tr>`
  const space = c.customerSide ? `${c.workspace} × Seven Billion` : c.customer ? `Seven Billion · ${c.customer}` : 'Seven Billion'
  const preheader = clip(`${v.intro} ${(c.details ?? []).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`).join(' · ')}`, 140)
  const img = (f: string) => `${siteOrigin}/email/${f}.png`

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#e9f0f1;font-family:${SANS};color:#13343b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9f0f1"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d9e4e6">
<tr><td bgcolor="${m.bg}" style="background:${m.bg};padding:18px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="vertical-align:middle"><img src="${siteOrigin}/brand/mark-64.png" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;background:#ffffff;border-radius:6px;padding:2px"><span style="font-weight:700;font-size:15px;color:#ffffff;margin-left:9px;vertical-align:middle;letter-spacing:.02em">Helm</span></td>
  <td align="right" style="vertical-align:middle;font-size:12px;color:${m.soft}">${esc(space)}</td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr>
  <td style="vertical-align:top;padding-right:16px">
    <span style="display:inline-block;background:${m.pill};color:${m.pillText};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:5px 10px;border-radius:999px">${esc(v.eyebrow)}</span>
    <h1 style="margin:14px 0 10px;font-family:${SERIF};font-weight:600;font-size:27px;line-height:1.22;color:#ffffff">${esc(title)}</h1>
    <div style="font-size:15px;line-height:1.6;color:${m.soft}">${esc(v.intro)}</div></td>
  <td width="64" style="vertical-align:top"><img src="${img(l.badge)}" width="64" height="64" alt="" style="display:block;border:0"></td></tr></table>
</td></tr>
<tr><td bgcolor="${m.bg}" style="background:${m.bg};padding:18px 0 0;font-size:0;line-height:0"><img src="${img('wave')}" width="580" height="22" alt="" style="display:block;width:100%;max-width:580px;height:auto;border:0"></td></tr>
<tr><td style="padding-top:12px;font-size:0;line-height:0">&nbsp;</td></tr>
${c.stage ? tracker(c.stage) : ''}${ticket(rows, m.bg)}${bodyHtml}
<tr><td style="padding:6px 28px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${m.bg}" style="background:${m.bg};border-radius:8px">
<a href="${esc(link)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(v.cta)} &nbsp;&rarr;</a></td></tr></table></td></tr>
${l.ps ? `<tr><td style="padding:0 28px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#fff7ec;border:1px solid #f6dfbf;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.55;color:#6b4a2b"><b style="color:#a94b31">P.S.</b> ${esc(l.ps)}</td></tr></table></td></tr>` : ''}
<tr><td bgcolor="#f4f8f8" style="background:#f4f8f8;padding:18px 28px 20px;border-top:1px solid #e6eef0">
  <div style="font-family:${SERIF};font-style:italic;font-size:16px;color:#2e575d">${esc(l.signoff)},<br>the Seven Billion crew</div>
  <div style="font-size:11px;line-height:1.5;color:#7d9196;margin-top:10px">Sent to ${esc(to)} from the ${esc(c.customerSide ? `${c.workspace} workspace` : 'Seven Billion workspace')} in Helm.</div></td></tr>
</table></td></tr></table></body></html>`
  const text = `${v.eyebrow.toUpperCase()}\n${title}\n\n${v.intro}\n${rows.map(([k, val]) => `${k}: ${val}`).join('\n')}${body ? `\n\n${body}` : ''}\n\n${v.cta}: ${link}${l.ps ? `\n\nP.S. ${l.ps}` : ''}\n\n${l.signoff},\nthe Seven Billion crew\n\nSent to ${to} from ${space} in Helm.`
  return { subject: v.subject, html, text }
}
