// Project templates: the Seven Billion delivery playbook. A new engagement copies its phases and tasks.
// Offsets are in days from the project start. Tasks marked customer: true become customer action items once assigned.

export type TemplateTask = { title: string; start: number; days: number; customer?: boolean; spotlight?: boolean; internal?: boolean; estimate?: number }
export type ProjectTemplate = { key: string; name: string; summary: string; weeks: number; phases: { name: string; tasks: TemplateTask[] }[] }

export const TEMPLATES: ProjectTemplate[] = [
  {
    key: 'power_bi_reporting', name: 'Power BI Reporting', summary: 'Dashboards on an existing data source, from KPI workshop to handover.', weeks: 12,
    phases: [
      { name: 'Discovery', tasks: [
        { title: 'Kickoff', start: 0, days: 1, estimate: 4 },
        { title: 'Complete data access form', start: 1, days: 5, customer: true, spotlight: true },
        { title: 'KPI workshop', start: 5, days: 3, estimate: 12 },
      ] },
      { name: 'Data Engineering', tasks: [
        { title: 'Source connection', start: 10, days: 10, estimate: 24 },
        { title: 'Data mapping', start: 20, days: 10, estimate: 32 },
        { title: 'Semantic model', start: 30, days: 10, estimate: 40 },
      ] },
      { name: 'Reporting', tasks: [
        { title: 'Wireframes', start: 30, days: 7, estimate: 16 },
        { title: 'Approve wireframes', start: 37, days: 3, customer: true, spotlight: true },
        { title: 'Dashboard development', start: 40, days: 15, estimate: 60 },
        { title: 'Internal QA', start: 55, days: 3, internal: true, estimate: 12 },
      ] },
      { name: 'UAT', tasks: [
        { title: 'Customer testing', start: 60, days: 7, customer: true, spotlight: true },
        { title: 'Fixes', start: 67, days: 5, estimate: 16 },
        { title: 'UAT sign-off', start: 72, days: 2, customer: true, spotlight: true },
      ] },
      { name: 'Deployment', tasks: [
        { title: 'Production release', start: 75, days: 2, estimate: 6 },
        { title: 'Training', start: 78, days: 2, estimate: 6 },
        { title: 'Handover', start: 82, days: 2, estimate: 4 },
      ] },
    ],
  },
  {
    key: 'erp_integration', name: 'ERP Integration', summary: 'Connect an ERP (Infor, SAP, Dynamics) to the data platform and downstream apps.', weeks: 16,
    phases: [
      { name: 'Discovery', tasks: [
        { title: 'Kickoff', start: 0, days: 1, estimate: 4 },
        { title: 'Provide API documentation and test credentials', start: 1, days: 7, customer: true, spotlight: true },
      ] },
      { name: 'Design', tasks: [
        { title: 'Integration architecture', start: 8, days: 10, estimate: 24 },
        { title: 'Approve integration design', start: 18, days: 3, customer: true, spotlight: true },
      ] },
      { name: 'API Development', tasks: [
        { title: 'Extraction services', start: 21, days: 25, estimate: 80 },
        { title: 'Error handling and retries', start: 40, days: 10, estimate: 24 },
      ] },
      { name: 'Testing', tasks: [
        { title: 'Integration testing', start: 55, days: 15, estimate: 40 },
        { title: 'Customer acceptance', start: 70, days: 10, customer: true, spotlight: true },
      ] },
      { name: 'Go-live', tasks: [
        { title: 'Cut-over', start: 85, days: 3, estimate: 12 },
        { title: 'Hypercare', start: 88, days: 20, estimate: 20 },
      ] },
    ],
  },
  {
    key: 'bi_implementation', name: 'BI Implementation', summary: 'End-to-end analytics: data platform, model and dashboards.', weeks: 20,
    phases: [
      { name: 'Discovery', tasks: [
        { title: 'Kickoff', start: 0, days: 1, estimate: 4 },
        { title: 'Data source assessment form', start: 1, days: 7, customer: true, spotlight: true },
      ] },
      { name: 'Data Platform', tasks: [{ title: 'Data architecture', start: 10, days: 15, estimate: 40 }, { title: 'Pipelines', start: 25, days: 25, estimate: 80 }] },
      { name: 'Reporting', tasks: [{ title: 'Dashboards', start: 50, days: 30, estimate: 100 }] },
      { name: 'UAT', tasks: [{ title: 'Customer testing', start: 85, days: 10, customer: true, spotlight: true }, { title: 'UAT sign-off', start: 95, days: 3, customer: true, spotlight: true }] },
      { name: 'Deployment', tasks: [{ title: 'Production and training', start: 100, days: 10, estimate: 20 }] },
    ],
  },
  {
    key: 'ai_workflow_pilot', name: 'AI Workflow Pilot', summary: 'A focused 6-week pilot that proves value on one workflow.', weeks: 6,
    phases: [
      { name: 'Frame', tasks: [{ title: 'Kickoff and success criteria', start: 0, days: 3, estimate: 8 }, { title: 'Share sample documents', start: 1, days: 5, customer: true, spotlight: true }] },
      { name: 'Build', tasks: [{ title: 'Prototype', start: 7, days: 14, estimate: 60 }, { title: 'Evaluation set', start: 10, days: 7, estimate: 16, internal: true }] },
      { name: 'Prove', tasks: [{ title: 'Pilot with users', start: 21, days: 14, customer: true, spotlight: true }, { title: 'Results and recommendation', start: 35, days: 5, estimate: 12 }] },
    ],
  },
  {
    key: 'support_engagement', name: 'Support Engagement', summary: 'Ongoing support and small enhancements under a retainer.', weeks: 52,
    phases: [{ name: 'Onboarding', tasks: [{ title: 'Access and runbook', start: 0, days: 10, estimate: 8 }, { title: 'Confirm support contacts', start: 0, days: 5, customer: true }] }],
  },
]

export const templateByKey = (key: string | null | undefined) => TEMPLATES.find((t) => t.key === key)

/** Picks a template from the HubSpot "service" or deal name. */
export function suggestTemplate(text: string): string {
  const t = text.toLowerCase()
  if (/power ?bi|dashboard|report/.test(t)) return 'power_bi_reporting'
  if (/erp|infor|sap|dynamics|integration/.test(t)) return 'erp_integration'
  if (/\bai\b|genai|llm|agent|pilot/.test(t)) return 'ai_workflow_pilot'
  if (/support|retainer|amc/.test(t)) return 'support_engagement'
  return 'bi_implementation'
}
