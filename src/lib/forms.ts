import { z } from 'zod'

/**
 * The fixed forms of the MVP. New request, change request and access request are requests (see /portal/requests/new);
 * these four are stored as submissions. A form builder comes in phase 2; until then this file is the single source.
 */
export type FormKey = 'kickoff' | 'data_access' | 'uat_feedback' | 'closure'

type Option = { value: string; label: string }
export type Field = {
  name: string; label: string; type: 'text' | 'textarea' | 'select' | 'radio' | 'date'
  options?: Option[]; required?: boolean; help?: string; placeholder?: string
  /** only shown (and required) when another field has this value */
  when?: { field: string; is: string }
}
export type FormDef = { key: FormKey; title: string; intro: string; fields: Field[] }

const YES_NO: Option[] = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }]

export const FORMS: Record<FormKey, FormDef> = {
  kickoff: {
    key: 'kickoff', title: 'Kickoff',
    intro: 'Ten minutes now saves weeks later. This tells us what success looks like and who we will work with.',
    fields: [
      { name: 'goals', label: 'What should this project achieve?', type: 'textarea', required: true, placeholder: 'The business outcome, in your words' },
      { name: 'success', label: 'How will you measure success?', type: 'textarea', required: true, placeholder: 'e.g. Regional managers plan stock from the dashboard every Monday' },
      { name: 'users', label: 'Who will use it?', type: 'textarea', placeholder: 'Names and roles of the main users' },
      { name: 'systems', label: 'Source systems', type: 'text', placeholder: 'e.g. SAP S/4HANA, Excel, Salesforce' },
      { name: 'data_owner', label: 'Who owns the data on your side?', type: 'text', required: true },
      { name: 'constraints', label: 'Dates or constraints we should know', type: 'textarea', placeholder: 'Board meetings, freezes, holidays' },
      { name: 'cadence', label: 'How would you like updates?', type: 'select', options: [
        { value: 'weekly_call', label: 'Weekly call + written update' }, { value: 'written', label: 'Written update only' }, { value: 'fortnightly', label: 'Fortnightly call' }] },
    ],
  },
  data_access: {
    key: 'data_access', title: 'Data access',
    intro: 'Tell us how we can reach the data. Please do not paste passwords here: your IT team can share credentials through their secure channel.',
    fields: [
      { name: 'systems', label: 'Which systems or databases?', type: 'textarea', required: true },
      { name: 'method', label: 'How will access be given?', type: 'select', required: true, options: [
        { value: 'db_readonly', label: 'Read-only database user (VPN if needed)' }, { value: 'api', label: 'API credentials' },
        { value: 'files', label: 'Scheduled file exports (SFTP / SharePoint)' }, { value: 'other', label: 'Other' }] },
      { name: 'it_contact', label: 'IT contact (name and email)', type: 'text', required: true },
      { name: 'ready_by', label: 'Expected date', type: 'date' },
      { name: 'notes', label: 'Anything else', type: 'textarea' },
    ],
  },
  uat_feedback: {
    key: 'uat_feedback', title: 'UAT feedback',
    intro: 'Test the solution with real scenarios and tell us how it went. Issues become tracked requests automatically.',
    fields: [
      { name: 'outcome', label: 'Result', type: 'radio', required: true, options: [
        { value: 'accepted', label: 'Accepted: ready to sign off' }, { value: 'issues', label: 'Found issues that need fixing' }] },
      { name: 'issues', label: 'What needs fixing?', type: 'textarea', required: true, when: { field: 'outcome', is: 'issues' }, placeholder: 'One issue per line, with where you saw it' },
      { name: 'severity', label: 'Most serious issue', type: 'select', when: { field: 'outcome', is: 'issues' }, options: [
        { value: 'minor', label: 'Minor: cosmetic or workaround exists' }, { value: 'major', label: 'Major: wrong numbers or missing feature' },
        { value: 'blocking', label: 'Blocking: cannot go live' }] },
      { name: 'tested_by', label: 'Tested by', type: 'text', required: true },
      { name: 'comments', label: 'Comments', type: 'textarea' },
    ],
  },
  closure: {
    key: 'closure', title: 'Project closure',
    intro: 'Confirm the handover and tell us how we did. Your answers go to the Seven Billion leadership team.',
    fields: [
      { name: 'handover', label: 'Handover documents received?', type: 'radio', required: true, options: YES_NO },
      { name: 'training', label: 'Training completed?', type: 'radio', required: true, options: YES_NO },
      { name: 'satisfaction', label: 'Overall, how satisfied are you?', type: 'select', required: true, options: [
        { value: '5', label: 'Very satisfied' }, { value: '4', label: 'Satisfied' }, { value: '3', label: 'Neutral' },
        { value: '2', label: 'Dissatisfied' }, { value: '1', label: 'Very dissatisfied' }] },
      { name: 'went_well', label: 'What went well?', type: 'textarea' },
      { name: 'improve', label: 'What should we do better?', type: 'textarea' },
      { name: 'open_items', label: 'Anything still open?', type: 'textarea' },
    ],
  },
}

export const formByKey = (key: string): FormDef | undefined => (key in FORMS ? FORMS[key as FormKey] : undefined)

/** Validates raw form input against a definition; returns clean answers or the first problem in plain words. */
export function parseAnswers(def: FormDef, raw: Record<string, unknown>): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const answers: Record<string, string> = {}
  for (const f of def.fields) {
    if (f.when && raw[f.when.field] !== f.when.is) continue
    const v = z.string().trim().max(5000).safeParse(raw[f.name] ?? '')
    const value = v.success ? v.data : ''
    if (f.required && !value) return { ok: false, error: `Please answer: ${f.label}` }
    if (value && f.options && !f.options.some((o) => o.value === value)) return { ok: false, error: `Choose an option for: ${f.label}` }
    if (value && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: `Enter a valid date for: ${f.label}` }
    if (value) answers[f.name] = value
  }
  return { ok: true, answers }
}

/** Human-readable answers for staff views. */
export function describeAnswers(def: FormDef, answers: Record<string, string>): { label: string; value: string }[] {
  return def.fields.filter((f) => answers[f.name]).map((f) => ({
    label: f.label, value: f.options?.find((o) => o.value === answers[f.name])?.label ?? answers[f.name]!,
  }))
}
