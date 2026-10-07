import { describe, expect, it } from 'vitest'
import { composeEmail, look, voice, type EmailContext } from '@/lib/email-copy'

const omar: EmailContext = { first: 'Omar', customerSide: true, workspace: 'Nesma Group' }
const rahul: EmailContext = { first: 'Rahul', customerSide: false, workspace: 'Seven Billion', customer: 'Nesma Group' }
const base = { body: '', link: 'https://helm.sevenbillion.co/requests/1', siteOrigin: 'https://helm.sevenbillion.co', to: 'omar@nesma.example.com' }

describe('notification emails', () => {
  it('greet by first name and show the workspace', () => {
    const { subject, html, text } = composeEmail({ ...base, kind: 'approval.requested', title: 'Estimate for REQ-1003: regional forecast', c: { ...omar, details: [['Effort', '3 days'], ['Decision needed by', 'Oct 12']] } })
    expect(subject).toBe('Your call, Omar: Estimate for REQ-1003: regional forecast')
    expect(html).toContain('Hi Omar, the team needs your OK')
    expect(html).toContain('Nesma Group × Seven Billion')
    expect(html).toContain('3 days')
    expect(text).toContain('Decision needed by: Oct 12')
  })

  it('does not repeat a summary the details box already shows, but keeps real messages', () => {
    const c = { ...omar, details: [['Effort', '3 days']] as [string, string][] }
    expect(composeEmail({ ...base, kind: 'approval.requested', title: 'x', body: 'Effort 3 days. Target Oct 16.', c }).html).not.toContain('Target Oct 16')
    expect(composeEmail({ ...base, kind: 'approval.changes_requested', title: 'x', body: 'Please add the 3 territories', c }).html).toContain('Please add the 3 territories')
  })

  it('staff see which customer it is about', () => {
    const v = voice('request.submitted', 'REQ-1009 Weekly stock email', rahul)
    expect(v.subject).toBe('New ask from Nesma Group: REQ-1009 Weekly stock email')
    expect(composeEmail({ ...base, kind: 'request.submitted', title: 'REQ-1009', c: rahul }).html).toContain('Seven Billion · Nesma Group')
  })

  it('a request email shows how far along it is', () => {
    const { html } = composeEmail({ ...base, kind: 'request.status', title: 'REQ-1004 is now Scheduled', c: { ...omar, stage: 'scheduled' } })
    expect(html).toContain('Step 6 of 9')
    expect(composeEmail({ ...base, kind: 'request.status', title: 'x', c: { ...omar, stage: 'delivered' } }).html).toContain('Land ahoy')
  })

  it('escapes anything people typed', () => {
    const { html } = composeEmail({ ...base, kind: 'task.assigned', title: 'Task for you: <script>alert(1)</script>', body: '<b>hi</b>', c: rahul })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<b>hi</b>')
  })

  it('leaves out empty details and unknown kinds still read well', () => {
    const { html, subject } = composeEmail({ ...base, kind: 'something.new', title: 'Hello', c: { ...omar, details: [['Project', ''], ['Due', 'Oct 3']] } })
    expect(subject).toBe('Hello')
    expect(html).not.toContain('>Project<')
    expect(html).toContain('Oct 3')
  })

  it('each kind has its own colour, icon, P.S. and sign-off', () => {
    expect(look('project.at_risk', rahul).badge).toBe('wind-terra')
    expect(look('request.status', { ...omar, stage: 'delivered' }).badge).toBe('anchor-turq')
    const { html, text } = composeEmail({ ...base, kind: 'approval.requested', title: 'x', c: omar })
    expect(html).toContain('https://helm.sevenbillion.co/email/compass-inky.png')
    expect(html).toContain('/email/wave.png')
    expect(html).toContain('Fair winds,<br>the Seven Billion crew')
    expect(text).toContain('P.S. Not sure yet?')
  })

  it('a customer comment reads as a quote, and the stage is not repeated under the progress bar', () => {
    expect(composeEmail({ ...base, kind: 'approval.changes_requested', title: 'x', body: 'Split it in two', c: rahul }).html).toMatch(/font-style:italic[^>]*><p[^>]*>Split it in two/)
    const { html } = composeEmail({ ...base, kind: 'request.status', title: 'x', c: { ...omar, stage: 'uat', details: [['Stage', 'UAT'], ['Priority', 'High']] } })
    expect(html).not.toContain('>Stage<')
    expect(html).toContain('next up: Delivered')
  })
})
