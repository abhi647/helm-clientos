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
    case 'billing':
      return { eyebrow: 'Numbers to check', intro: `Hi ${c.first}, there is something in Billing for you to look at.`, subject: t, cta: 'Open Billing' }
    default:
      return { eyebrow: c.workspace, intro: `Hi ${c.first},`, subject: t, cta: 'Open in Helm' }
  }
}

/** The progress tracker: nine stages, the ones reached filled in. Plain tables, so every email client shows it. */
function tracker(stage: string) {
  const at = STAGES.indexOf(stage)
  if (at < 0) return ''
  const cells = STAGES.map((s, i) => `<td title="${esc(stageLabel(s))}" style="height:6px;background:${i <= at ? '#208090' : '#dbe4e6'};border-radius:3px"></td>`).join('<td style="width:3px"></td>')
  return `<tr><td style="padding:2px 24px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
<div style="font-size:12px;color:#5b6b70;margin-top:6px">Step ${at + 1} of ${STAGES.length}: <b style="color:#13343b">${esc(stageLabel(stage))}</b></div></td></tr>`
}

export function composeEmail({ kind, title, body, link, c, siteOrigin, to }: {
  kind: string; title: string; body: string; link: string; c: EmailContext; siteOrigin: string; to: string
}) {
  const v = voice(kind, title, c)
  const rows = (c.details ?? []).filter(([, val]) => val)
  // these bodies only summarise the record ("Effort 3 days. Target Oct 16."); the details box already says it
  const summaryOnly = rows.length > 0 && ['approval.requested', 'action.assigned', 'task.assigned', 'request.submitted', 'request.critical'].includes(kind)
  const shown = summaryOnly ? '' : body
  const paragraphs = shown ? shown.split(/\n+/).map((p) => `<p style="margin:0 0 10px">${esc(p)}</p>`).join('') : ''
  const detailHtml = rows.length ? `<tr><td style="padding:4px 24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border:1px solid #e2eaec;border-radius:6px">
${rows.map(([k, val]) => `<tr><td style="padding:7px 12px;font-size:12px;color:#5b6b70;width:34%;vertical-align:top">${esc(k)}</td><td style="padding:7px 12px;font-size:13px;color:#13343b;font-weight:600">${esc(val)}</td></tr>`).join('')}
</table></td></tr>` : ''
  const space = c.customerSide ? `${c.workspace} × Seven Billion` : c.customer ? `Seven Billion · ${c.customer}` : 'Seven Billion'
  const preheader = clip(`${v.intro} ${rows.map(([k, val]) => `${k}: ${val}`).join(' · ')}`, 140)

  const html = `<!doctype html><html><body style="margin:0;background:#eef3f4;font-family:'IBM Plex Sans',Arial,sans-serif;color:#13343b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfe7e9;border-radius:8px;overflow:hidden">
<tr><td style="background:#13343b;padding:14px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${siteOrigin}/brand/mark-64.png" width="22" height="22" alt="" style="display:inline-block;vertical-align:middle;border:0;background:#ffffff;border-radius:4px;padding:2px"><span style="font-weight:600;font-size:14px;color:#ffffff;margin-left:8px;vertical-align:middle">Helm</span></td>
<td align="right" style="font-size:12px;color:#9fc2c8;vertical-align:middle">${esc(space)}</td></tr></table></td></tr>
<tr><td style="padding:20px 24px 2px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#208090">${esc(v.eyebrow)}</td></tr>
<tr><td style="padding:6px 24px 6px"><h1 style="margin:0;font-size:20px;line-height:1.3;color:#13343b">${esc(title)}</h1></td></tr>
<tr><td style="padding:4px 24px 10px;font-size:14px;line-height:1.6;color:#3f565c">${esc(v.intro)}</td></tr>
${c.stage ? tracker(c.stage) : ''}${detailHtml}
${paragraphs ? `<tr><td style="padding:2px 24px 6px;font-size:14px;line-height:1.55;color:#4a5b60">${paragraphs}</td></tr>` : ''}
<tr><td style="padding:8px 24px 24px"><a href="${esc(link)}" style="display:inline-block;background:#13343b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:5px">${esc(v.cta)} &rarr;</a></td></tr>
<tr><td style="padding:14px 24px 18px;border-top:1px solid #eef2f3;font-size:12px;line-height:1.5;color:#6a7f84">Sent to ${esc(to)} from the ${esc(c.customerSide ? `${c.workspace} workspace` : 'Seven Billion workspace')} in Helm.<br><span style="color:#8aa0a5">Steady hands on the wheel. Seven Billion</span></td></tr>
</table></td></tr></table></body></html>`
  const text = `${v.eyebrow.toUpperCase()}\n${title}\n\n${v.intro}\n${rows.map(([k, val]) => `${k}: ${val}`).join('\n')}${body ? `\n\n${body}` : ''}\n\n${v.cta}: ${link}\n\nSent to ${to} from ${space} in Helm.`
  return { subject: v.subject, html, text }
}
