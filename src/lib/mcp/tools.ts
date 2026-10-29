import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Enums } from '@/lib/database.types'
import { HelmError, helm, type Helm } from '@/lib/mcp/context'

/**
 * The tools an AI gets when someone connects Helm. Reads cover what the person can see in the app; writes are the
 * everyday edits (tasks, comments, time, requests). Nothing here deletes, approves, bills or changes settings.
 * Every call runs as the signed-in person, so the database's Row Level Security still decides what is allowed.
 */

type Args = Record<string, unknown>
type Ctx = { http?: { authInfo?: Parameters<typeof helm>[0] } }
type Tool<A extends Args> = (h: Helm, args: A) => Promise<unknown>

const TASK_STATUS = ['todo', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'done'] as const
const REQUEST_STATUS = ['submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered', 'cancelled'] as const
const REQUEST_TYPES = ['requirement', 'enhancement', 'change_request', 'bug', 'new_report', 'data_request', 'access_request', 'support', 'other'] as const
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
const id = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] })
const problem = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })
const dbProblem = (error: { message: string } | null) =>
  problem(error?.message?.includes('row-level security') ? 'Helm does not allow this for your account.' : `Helm could not do that: ${error?.message ?? 'unknown error'}`)
const staffOnly = (h: Helm) => { if (!h.staff) throw new HelmError('Only the Seven Billion team can do this. Use add_comment or create_request instead.') }

/** Registers a tool: parses input, resolves the person, turns errors into messages the AI can act on. */
function tool<S extends z.ZodObject>(server: McpServer, name: string, config: { title: string; description: string; input: S; write?: boolean }, run: Tool<z.infer<S>>) {
  server.registerTool(name, {
    title: config.title, description: config.description, inputSchema: config.input,
    annotations: { readOnlyHint: !config.write, destructiveHint: false, idempotentHint: !config.write, openWorldHint: false },
  }, (async (args: z.infer<S>, ctx: Ctx) => {
    try {
      const out = await run(await helm(ctx.http?.authInfo), args)
      return out && typeof out === 'object' && 'content' in out ? out : text(out)
    } catch (err) {
      return problem(err instanceof HelmError ? err.message : `Something went wrong in Helm: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }) as never)
}

const person = (p: { id: string; full_name: string; kind?: string } | null | undefined) => (p ? { id: p.id, name: p.full_name, ...(p.kind ? { side: p.kind === 'customer' ? 'customer' : 'seven_billion' } : {}) } : null)
const TASK_FIELDS = 'id, title, status, start_date, due_date, visibility, owner_side, project_id, phase_id, parent_id, description, spotlight, assignee:profiles!tasks_assignee_id_fkey(id, full_name, kind), projects(name, customers(name)), phases(name), task_estimates(estimate, unit)'
type TaskRow = {
  id: string; title: string; status: Enums<'task_status'>; start_date: string | null; due_date: string | null; visibility: string; owner_side: string
  project_id: string; phase_id: string | null; parent_id: string | null; description?: string | null; spotlight?: boolean
  assignee: { id: string; full_name: string; kind: string } | null; projects: { name: string; customers: { name: string } | null } | null
  phases: { name: string } | null; task_estimates: { estimate: number; unit: string } | null
}
const taskOut = (t: TaskRow, staff: boolean) => ({
  id: t.id, title: t.title, status: t.status, overdue: t.status !== 'done' && !!t.due_date && t.due_date < today(),
  project: { id: t.project_id, name: t.projects?.name, customer: t.projects?.customers?.name }, phase: t.phases?.name ?? null,
  parent_task_id: t.parent_id, owner: person(t.assignee), start_date: t.start_date, due_date: t.due_date,
  ...(staff ? { visibility: t.visibility, estimate: t.task_estimates ? `${t.task_estimates.estimate} ${t.task_estimates.unit}` : null } : {}),
  link: `${process.env.NEXT_PUBLIC_SITE_URL}/${staff ? '' : 'portal/'}projects/${t.project_id}?task=${t.id}`,
})

export function registerHelmTools(server: McpServer) {
  // ------------------------------------------------------------------ who and what
  tool(server, 'whoami', {
    title: 'Who am I in Helm', input: z.object({}),
    description: 'The signed-in Helm user: name, side (Seven Billion team or customer), role and company. Call this first to know what you can do.',
  }, async ({ me, staff }) => ({
    id: me.id, name: me.full_name, email: me.email, side: staff ? 'seven_billion' : 'customer',
    role: staff ? me.internal_role : me.customer_role, customer_id: me.customer_id,
    can: staff ? 'read everything you can see in Helm; create and update tasks, log time, comment, create requests and move request stages'
      : 'read your company\'s projects, tasks, requests and updates; comment; create requests',
  }))

  tool(server, 'list_projects', {
    title: 'List projects', input: z.object({ search: z.string().max(100).optional(), status: z.enum(['active', 'on_hold', 'completed']).optional() }),
    description: 'Projects you can see, with customer, status, health, PM and dates. Filter by name or status (active, on_hold, completed).',
  }, async ({ db }, { search, status }) => {
    let q = db.from('projects').select('id, name, status, health, start_date, end_date, customers(name), pm:profiles!projects_pm_id_fkey(id, full_name)').order('name').limit(200)
    if (status) q = q.eq('status', status)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data, error } = await q
    if (error) return dbProblem(error)
    return (data ?? []).map((p) => ({ id: p.id, name: p.name, customer: p.customers?.name, status: p.status, health: p.health, pm: person(p.pm), start_date: p.start_date, end_date: p.end_date }))
  })

  tool(server, 'get_project', {
    title: 'Project overview', input: z.object({ project_id: id }),
    description: 'One project: phases with progress, task counts by status, overdue tasks, open requests and the latest published weekly update.',
  }, async ({ db, staff }, { project_id }) => {
    const [{ data: p, error }, { data: phases }, { data: tasks }, { data: requests }, { data: update }] = await Promise.all([
      db.from('projects').select('id, name, status, health, start_date, end_date, customers(name), pm:profiles!projects_pm_id_fkey(id, full_name)').eq('id', project_id).maybeSingle(),
      db.from('phases').select('id, name, position').eq('project_id', project_id).order('position'),
      db.from('tasks').select('id, title, status, due_date, phase_id, parent_id').eq('project_id', project_id),
      db.from('requests').select('id, number, title, status, priority').eq('project_id', project_id).not('status', 'in', '(delivered,cancelled)'),
      db.from('updates').select('week_of, health, completed, in_progress, next_week, waiting_on_customer').eq('project_id', project_id).eq('status', 'published').order('week_of', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (error) return dbProblem(error)
    if (!p) return problem('No such project, or you cannot see it.')
    const top = (tasks ?? []).filter((t) => !t.parent_id)
    const byStatus = Object.fromEntries(TASK_STATUS.map((s) => [s, top.filter((t) => t.status === s).length]))
    return {
      id: p.id, name: p.name, customer: p.customers?.name, status: p.status, health: p.health, pm: person(p.pm), start_date: p.start_date, end_date: p.end_date,
      tasks: { total: top.length, by_status: byStatus },
      phases: (phases ?? []).map((ph) => { const ts = top.filter((t) => t.phase_id === ph.id); return { id: ph.id, name: ph.name, tasks: ts.length, done: ts.filter((t) => t.status === 'done').length } }),
      overdue: (tasks ?? []).filter((t) => t.status !== 'done' && t.due_date && t.due_date < today()).map((t) => ({ id: t.id, title: t.title, due_date: t.due_date })),
      open_requests: requests ?? [], latest_update: update ?? null,
      link: `${process.env.NEXT_PUBLIC_SITE_URL}/${staff ? '' : 'portal/'}projects/${p.id}`,
    }
  })

  // ------------------------------------------------------------------ tasks
  tool(server, 'list_tasks', {
    title: 'List tasks',
    input: z.object({
      project_id: id.optional(), assignee: z.string().optional().describe('"me", "unassigned", or a person id from list_people'),
      status: z.array(z.enum(TASK_STATUS)).optional(), include_done: z.boolean().default(false),
      due_within_days: z.number().int().min(0).max(365).optional().describe('only tasks due within this many days (overdue included)'),
      search: z.string().max(100).optional(), limit: z.number().int().min(1).max(500).default(100),
    }),
    description: 'Tasks and subtasks you can see, newest due first. Filter by project, owner, status, due window or title. Done tasks are left out unless include_done is true.',
  }, async ({ db, me, staff }, a) => {
    let q = db.from('tasks').select(TASK_FIELDS).order('due_date', { ascending: true, nullsFirst: false }).limit(a.limit)
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.assignee === 'me') q = q.eq('assignee_id', me.id)
    else if (a.assignee === 'unassigned') q = q.is('assignee_id', null)
    else if (a.assignee) q = q.eq('assignee_id', a.assignee)
    if (a.status?.length) q = q.in('status', a.status)
    else if (!a.include_done) q = q.neq('status', 'done')
    if (a.due_within_days != null) q = q.lte('due_date', plusDays(a.due_within_days))
    if (a.search) q = q.ilike('title', `%${a.search}%`)
    const { data, error } = await q
    if (error) return dbProblem(error)
    return (data as unknown as TaskRow[]).map((t) => taskOut(t, staff))
  })

  tool(server, 'my_work', {
    title: 'My work', input: z.object({}),
    description: 'Your open tasks, grouped: overdue, due today, this week, waiting on the customer, later. The same as the My Work page.',
  }, async ({ db, me, staff }) => {
    const { data, error } = await db.from('tasks').select(TASK_FIELDS).eq('assignee_id', me.id).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(500)
    if (error) return dbProblem(error)
    const groups: Record<string, unknown[]> = { overdue: [], today: [], this_week: [], waiting_on_customer: [], later: [] }
    for (const t of data as unknown as TaskRow[]) {
      const g = t.status === 'waiting_customer' ? 'waiting_on_customer' : !t.due_date ? 'later' : t.due_date < today() ? 'overdue' : t.due_date === today() ? 'today' : t.due_date <= plusDays(7) ? 'this_week' : 'later'
      groups[g]!.push(taskOut(t, staff))
    }
    return groups
  })

  tool(server, 'get_task', {
    title: 'Task details', input: z.object({ task_id: id }),
    description: 'One task: description, owner, dates, subtasks, the discussion you can see and (for the team) hours logged.',
  }, async ({ db, staff }, { task_id }) => {
    const { data: t, error } = await db.from('tasks').select(TASK_FIELDS).eq('id', task_id).maybeSingle()
    if (error) return dbProblem(error)
    if (!t) return problem('No such task, or you cannot see it.')
    const [{ data: subs }, { data: comments }, { data: time }] = await Promise.all([
      db.from('tasks').select(TASK_FIELDS).eq('parent_id', task_id).order('position'),
      db.from('comments').select('body, created_at, visibility, author:profiles!comments_author_id_fkey(full_name)').eq('entity_type', 'task').eq('entity_id', task_id).order('created_at'),
      staff ? db.from('time_entries').select('hours').eq('task_id', task_id) : Promise.resolve({ data: [] as { hours: number }[] }),
    ])
    return {
      ...taskOut(t as unknown as TaskRow, staff), description: (t as unknown as TaskRow).description ?? null,
      subtasks: ((subs ?? []) as unknown as TaskRow[]).map((s) => taskOut(s, staff)),
      discussion: (comments ?? []).map((c) => ({ by: (c.author as { full_name: string } | null)?.full_name, at: c.created_at, ...(staff ? { visibility: c.visibility } : {}), body: c.body })),
      ...(staff ? { hours_logged: (time ?? []).reduce((s, e) => s + Number(e.hours), 0) } : {}),
    }
  })

  tool(server, 'create_task', {
    title: 'Create a task', write: true,
    input: z.object({
      project_id: id, title: z.string().trim().min(2).max(200), description: z.string().max(10_000).optional(),
      phase_name: z.string().trim().max(120).optional().describe('an existing phase name; a new phase is started if none matches. Default: the first phase'),
      parent_task_id: id.optional().describe('makes this a subtask of that task'),
      assignee_id: id.optional(), start_date: date.optional(), due_date: date.optional(),
      visibility: z.enum(['shared', 'internal']).default('shared').describe('shared: the customer sees it; internal: team only'),
    }),
    description: 'Adds a task (or a subtask) to a project plan. Seven Billion team only. Find people ids with list_people.',
  }, async (h, a) => {
    staffOnly(h)
    const { db, me } = h
    const { data: project } = await db.from('projects').select('customer_id').eq('id', a.project_id).maybeSingle()
    if (!project) return problem('No such project, or you cannot see it.')
    let phase_id: string | null = null
    if (a.parent_task_id) {
      const { data: parent } = await db.from('tasks').select('phase_id, project_id').eq('id', a.parent_task_id).maybeSingle()
      if (!parent || parent.project_id !== a.project_id) return problem('The parent task is not in this project.')
      phase_id = parent.phase_id
    } else {
      // the plan shows tasks under their phase, so every task gets one (as in the app)
      const { data: phases } = await db.from('phases').select('id, name, position').eq('project_id', a.project_id).order('position')
      const match = a.phase_name ? phases?.find((p) => p.name.toLowerCase() === a.phase_name!.toLowerCase()) : phases?.[0]
      if (match) phase_id = match.id
      else {
        const { data: ph, error } = await db.from('phases')
          .insert({ project_id: a.project_id, customer_id: project.customer_id, name: a.phase_name || 'Delivery', position: (phases?.at(-1)?.position ?? -1) + 1 }).select('id').single()
        if (error || !ph) return dbProblem(error)
        phase_id = ph.id
      }
    }
    let owner_side: 'seven_billion' | 'customer' = 'seven_billion'
    if (a.assignee_id) {
      const { data: who } = await db.from('profiles').select('kind').eq('id', a.assignee_id).maybeSingle()
      if (!who) return problem('No such person. Use list_people to find their id.')
      if (who.kind === 'customer') owner_side = 'customer'
    }
    const { data: task, error } = await db.from('tasks').insert({
      project_id: a.project_id, customer_id: project.customer_id, phase_id, parent_id: a.parent_task_id ?? null, title: a.title,
      description: a.description, assignee_id: a.assignee_id ?? null, owner_side, start_date: a.start_date ?? null, due_date: a.due_date ?? null,
      visibility: a.visibility, created_by: me.id, position: 999,
    }).select(TASK_FIELDS).single()
    if (error || !task) return dbProblem(error)
    return { created: taskOut(task as unknown as TaskRow, true) }
  })

  tool(server, 'update_task', {
    title: 'Update a task', write: true,
    input: z.object({
      task_id: id, title: z.string().trim().min(2).max(200).optional(), description: z.string().max(10_000).optional(),
      status: z.enum(TASK_STATUS).optional(), assignee_id: id.nullable().optional().describe('null unassigns'),
      start_date: date.nullable().optional(), due_date: date.nullable().optional(),
    }),
    description: 'Changes a task: title, description, status (todo, in_progress, in_review, waiting_customer, blocked, done), owner or dates. Only the fields you pass change. Seven Billion team only.',
  }, async (h, a) => {
    staffOnly(h)
    const { db } = h
    const patch: Record<string, unknown> = {}
    if (a.title !== undefined) patch.title = a.title
    if (a.description !== undefined) patch.description = a.description
    if (a.start_date !== undefined) patch.start_date = a.start_date
    if (a.due_date !== undefined) patch.due_date = a.due_date
    if (a.status) { patch.status = a.status; patch.completed_at = a.status === 'done' ? new Date().toISOString() : null }
    if (a.assignee_id !== undefined) {
      patch.assignee_id = a.assignee_id
      patch.owner_side = 'seven_billion'
      if (a.assignee_id) {
        const { data: who } = await db.from('profiles').select('kind').eq('id', a.assignee_id).maybeSingle()
        if (!who) return problem('No such person. Use list_people to find their id.')
        if (who.kind === 'customer') patch.owner_side = 'customer'
      }
    }
    if (!Object.keys(patch).length) return problem('Nothing to change: pass at least one field.')
    const { data, error } = await db.from('tasks').update(patch as never).eq('id', a.task_id).select(TASK_FIELDS).maybeSingle()
    if (error) return dbProblem(error)
    if (!data) return problem('No such task, or you cannot change it.')
    return { updated: taskOut(data as unknown as TaskRow, true) }
  })

  tool(server, 'log_time', {
    title: 'Log time on a task', write: true,
    input: z.object({
      task_id: id, hours: z.number().positive().max(24).multipleOf(0.25).describe('in quarters of an hour: 0.25, 0.5, 1.75…'),
      worked_on: date.optional().describe('default today'), billable: z.boolean().default(true), note: z.string().max(500).optional(),
    }),
    description: 'Logs your hours on a task for a day. Your PM approves them weekly. Seven Billion team only.',
  }, async (h, a) => {
    staffOnly(h)
    const { data: task } = await h.db.from('tasks').select('customer_id, title').eq('id', a.task_id).maybeSingle()
    if (!task) return problem('No such task, or you cannot see it.')
    const { error } = await h.db.from('time_entries').insert({
      task_id: a.task_id, customer_id: task.customer_id, user_id: h.me.id, hours: a.hours, worked_on: a.worked_on ?? today(), billable: a.billable, note: a.note || null,
    })
    return error ? dbProblem(error) : `Logged ${a.hours} h on "${task.title}" for ${a.worked_on ?? today()}. It waits for your PM's approval.`
  })

  // ------------------------------------------------------------------ requests
  tool(server, 'list_requests', {
    title: 'List requests',
    input: z.object({ project_id: id.optional(), status: z.array(z.enum(REQUEST_STATUS)).optional(), open_only: z.boolean().default(true), search: z.string().max(100).optional() }),
    description: 'Customer requests (requirements, changes, bugs, data or access requests) you can see. Open ones only unless open_only is false.',
  }, async ({ db, staff }, a) => {
    let q = db.from('requests').select('id, number, title, type, priority, status, desired_date, created_at, project_id, projects(name), customers(name), owner:profiles!requests_owner_id_fkey(id, full_name)').order('created_at', { ascending: false }).limit(200)
    if (a.project_id) q = q.eq('project_id', a.project_id)
    if (a.status?.length) q = q.in('status', a.status)
    else if (a.open_only) q = q.not('status', 'in', '(delivered,cancelled)')
    if (a.search) q = q.ilike('title', `%${a.search}%`)
    const { data, error } = await q
    if (error) return dbProblem(error)
    return (data ?? []).map((r) => ({
      id: r.id, number: r.number, title: r.title, type: r.type, priority: r.priority, status: r.status, desired_date: r.desired_date, created_at: r.created_at,
      customer: r.customers?.name, project: r.projects?.name ?? null, owner: person(r.owner), link: `${process.env.NEXT_PUBLIC_SITE_URL}/${staff ? '' : 'portal/'}requests/${r.id}`,
    }))
  })

  tool(server, 'get_request', {
    title: 'Request details', input: z.object({ request_id: id }),
    description: 'One request: what is needed and why, stage, owner, and the discussion you can see.',
  }, async ({ db, staff }, { request_id }) => {
    const { data: r, error } = await db.from('requests').select('id, number, title, what, why, type, priority, status, desired_date, created_at, customer_id, project_id, projects(name), customers(name), owner:profiles!requests_owner_id_fkey(id, full_name)').eq('id', request_id).maybeSingle()
    if (error) return dbProblem(error)
    if (!r) return problem('No such request, or you cannot see it.')
    const { data: comments } = await db.from('comments').select('body, created_at, visibility, author:profiles!comments_author_id_fkey(full_name)').eq('entity_type', 'request').eq('entity_id', request_id).order('created_at')
    return {
      id: r.id, number: r.number, title: r.title, what: r.what, why: r.why, type: r.type, priority: r.priority, status: r.status, desired_date: r.desired_date,
      customer: r.customers?.name, project: r.projects?.name ?? null, owner: person(r.owner),
      discussion: (comments ?? []).map((c) => ({ by: (c.author as { full_name: string } | null)?.full_name, at: c.created_at, ...(staff ? { visibility: c.visibility } : {}), body: c.body })),
      link: `${process.env.NEXT_PUBLIC_SITE_URL}/${staff ? '' : 'portal/'}requests/${r.id}`,
    }
  })

  tool(server, 'create_request', {
    title: 'Create a request', write: true,
    input: z.object({
      title: z.string().trim().min(3).max(200), what: z.string().trim().min(3).max(5000).describe('what is needed'), why: z.string().max(5000).default(''),
      type: z.enum(REQUEST_TYPES).default('requirement'), priority: z.enum(PRIORITIES).default('normal'),
      project_id: id.optional(), desired_date: date.optional(),
      customer_id: id.optional().describe('team only: the customer the request is for (customers always raise for their own company)'),
    }),
    description: 'Raises a request: a requirement, enhancement, change, bug, report, data or access request. Customers raise for their own company; the team logs one on a customer\'s behalf.',
  }, async ({ db, me, staff }, a) => {
    const customer_id = staff ? a.customer_id : me.customer_id
    if (!customer_id) return problem(staff ? 'Pass customer_id: which customer is this request for?' : 'Your account is not linked to a company.')
    const people = staff ? { raised_by: me.id, owner_id: me.id } : { requested_by: me.id }
    const { data, error } = await db.from('requests').insert({
      title: a.title, what: a.what, why: a.why, type: a.type, priority: a.priority, project_id: a.project_id ?? null, desired_date: a.desired_date ?? null, customer_id, ...people,
    }).select('id, number').single()
    if (error || !data) return dbProblem(error)
    return { created: { id: data.id, number: data.number, link: `${process.env.NEXT_PUBLIC_SITE_URL}/${staff ? '' : 'portal/'}requests/${data.id}` } }
  })

  tool(server, 'set_request_stage', {
    title: 'Move a request to a stage', write: true,
    input: z.object({ request_id: id, status: z.enum(REQUEST_STATUS), note: z.string().max(500).optional() }),
    description: 'Moves a request along: submitted, under_review, clarification, estimated, approved, scheduled, in_development, uat, delivered, cancelled. Seven Billion team only.',
  }, async (h, a) => {
    staffOnly(h)
    const { error } = await h.db.rpc('set_request_status', { p_request: a.request_id, p_status: a.status, p_note: a.note || undefined })
    return error ? dbProblem(error) : `Request moved to ${a.status}.`
  })

  // ------------------------------------------------------------------ discussion, people, approvals
  tool(server, 'add_comment', {
    title: 'Comment on a task or request', write: true,
    input: z.object({
      on: z.enum(['task', 'request']), id, body: z.string().trim().min(1).max(10_000),
      shared: z.boolean().default(false).describe('team only: true shows the comment to the customer. Customer comments are always shared'),
    }),
    description: 'Posts a comment in the discussion of a task or request, as you.',
  }, async ({ db, me, staff }, a) => {
    const { data: item } = await db.from(a.on === 'task' ? 'tasks' : 'requests').select('customer_id').eq('id', a.id).maybeSingle()
    if (!item) return problem(`No such ${a.on}, or you cannot see it.`)
    const { error } = await db.from('comments').insert({
      entity_type: a.on, entity_id: a.id, customer_id: item.customer_id, body: a.body, author_id: me.id, mentions: [],
      visibility: !staff || a.shared ? 'shared' : 'internal',
    })
    return error ? dbProblem(error) : `Comment posted${staff ? (a.shared ? ' (the customer can see it)' : ' (team only)') : ''}.`
  })

  tool(server, 'list_people', {
    title: 'List people', input: z.object({ project_id: id.optional().describe('include the people at this project\'s customer') }),
    description: 'People you can assign or mention: the Seven Billion team, plus the customer\'s people for a project. Use the ids with create_task or update_task.',
  }, async ({ db }, { project_id }) => {
    let customer: string | null = null
    if (project_id) customer = (await db.from('projects').select('customer_id').eq('id', project_id).maybeSingle()).data?.customer_id ?? null
    let q = db.from('profiles').select('id, full_name, kind').order('kind').order('full_name').limit(500)
    q = customer ? q.or(`kind.eq.internal,customer_id.eq.${customer}`) : q
    const { data, error } = await q
    return error ? dbProblem(error) : (data ?? []).map((p) => person(p))
  })

  tool(server, 'list_approvals', {
    title: 'List approvals', input: z.object({ status: z.enum(['pending', 'approved', 'changes_requested', 'cancelled']).default('pending'), mine: z.boolean().default(false).describe('only approvals waiting on you') }),
    description: 'Approvals (estimates, sign-offs) and where they stand. Read only: deciding an approval is done in Helm itself.',
  }, async ({ db, me }, a) => {
    let q = db.from('approvals').select('id, title, kind, status, summary, due_date, effort, effort_unit, created_at, projects(name), customers(name), approver:profiles!approvals_approver_id_fkey(id, full_name)').eq('status', a.status).order('created_at', { ascending: false }).limit(200)
    if (a.mine) q = q.eq('approver_id', me.id)
    const { data, error } = await q
    if (error) return dbProblem(error)
    return (data ?? []).map((x) => ({ id: x.id, title: x.title, kind: x.kind, status: x.status, summary: x.summary, due_date: x.due_date, effort: x.effort ? `${x.effort} ${x.effort_unit}` : null, customer: x.customers?.name, project: x.projects?.name ?? null, approver: person(x.approver) }))
  })

  tool(server, 'list_updates', {
    title: 'Weekly updates', input: z.object({ project_id: id, limit: z.number().int().min(1).max(52).default(4) }),
    description: 'The published weekly status updates of a project, newest first: done, in progress, next week, waiting on the customer, health.',
  }, async ({ db }, a) => {
    const { data, error } = await db.from('updates').select('week_of, health, completed, in_progress, next_week, waiting_on_customer, published_at').eq('project_id', a.project_id).eq('status', 'published').order('week_of', { ascending: false }).limit(a.limit)
    return error ? dbProblem(error) : data ?? []
  })

  tool(server, 'search', {
    title: 'Search Helm', input: z.object({ query: z.string().trim().min(2).max(100) }),
    description: 'Finds projects, tasks and requests whose name or title contains the words. Use it to get ids for the other tools.',
  }, async ({ db, staff }, { query }) => {
    const like = `%${query}%`
    const [p, t, r] = await Promise.all([
      db.from('projects').select('id, name, customers(name)').ilike('name', like).limit(20),
      db.from('tasks').select(TASK_FIELDS).ilike('title', like).limit(30),
      db.from('requests').select('id, number, title, status').or(`title.ilike.${like},number.ilike.${like}`).limit(20),
    ])
    return {
      projects: (p.data ?? []).map((x) => ({ id: x.id, name: x.name, customer: x.customers?.name })),
      tasks: ((t.data ?? []) as unknown as TaskRow[]).map((x) => taskOut(x, staff)),
      requests: r.data ?? [],
    }
  })
}
