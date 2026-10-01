import { makeIssue } from "./domain.mjs";

export const SCENARIO_DATE = "2026-10-01";
export const STAGES = [
  "Handoff",
  "Scope",
  "Build",
  "Review",
  "UAT",
  "Handover",
];
export const TEMPLATES = [
  {
    id: "erp",
    name: "ERP integration",
    discipline: "Data & engineering",
    description:
      "Source access, canonical mappings, reconciliation and a controlled handover.",
    duration: "8–10 weeks · indicative",
    phases: ["Discovery", "Data engineering", "Validation", "UAT", "Handover"],
    tasks: [
      "Confirm source access and extraction scope",
      "Map canonical entities and business rules",
      "Build and validate the semantic layer",
      "Reconcile measures with source owners",
      "Run customer acceptance tests",
      "Publish operations runbook",
    ],
    color: "olive",
  },
  {
    id: "bi",
    name: "Business intelligence",
    discipline: "Analytics",
    description:
      "From decision requirements to governed measures and adopted dashboards.",
    duration: "6–8 weeks · indicative",
    phases: ["Discovery", "Modelling", "Reporting", "UAT", "Handover"],
    tasks: [
      "Agree decision outcomes and KPI definitions",
      "Profile source data and quality exceptions",
      "Create governed metrics and model",
      "Build dashboard and review navigation",
      "Validate results with business owners",
      "Train users and hand over ownership",
    ],
    color: "blue",
  },
  {
    id: "ai",
    name: "AI application pilot",
    discipline: "Applied AI",
    description:
      "A bounded pilot with evaluation criteria, human review and operational safeguards.",
    duration: "6–10 weeks · indicative",
    phases: ["Discovery", "Evaluation", "Build", "UAT", "Handover"],
    tasks: [
      "Agree pilot boundary and acceptance measures",
      "Review source permissions and data readiness",
      "Prepare evaluation set and baseline",
      "Implement the human review workflow",
      "Run quality and safety evaluations",
      "Document failure recovery and operations",
    ],
    color: "rose",
  },
  {
    id: "support",
    name: "Managed support",
    discipline: "Client operations",
    description:
      "Structured intake, accountable service ownership and transparent resolution.",
    duration: "Ongoing service",
    phases: ["Setup", "Intake", "Resolution", "Review"],
    tasks: [
      "Agree service scope and escalation owners",
      "Configure request categories and priorities",
      "Triage the initial service backlog",
      "Publish the monthly service review",
    ],
    color: "amber",
  },
];

const baseline = {
  deliveryVersion: 1,
  handoffs: [
    {
      id: "deal-demo-orbit",
      customer: "orbit",
      name: "Commerce data platform",
      contact: "Alex · Customer sponsor",
      service: "Data platform",
      template: "erp",
      owner: "ar",
      stage: "Closed won",
      source: "Manual demo",
      scope:
        "Unify commerce data for inventory, sales and management reporting. Confirm source readiness and acceptance measures before baselining.",
      project: "p4",
    },
    {
      id: "deal-demo-cbd-2",
      customer: "cbd",
      name: "Finance analytics rollout",
      contact: "Sara · Finance sponsor",
      service: "Business intelligence",
      template: "bi",
      owner: "mn",
      stage: "Closed won",
      source: "Manual demo",
      scope:
        "Extend approved finance metrics to the regional management team. Validate sources, review KPI definitions and train report owners.",
      project: null,
    },
  ],
  sprints: [],
  fieldDefinitions: [
    {
      id: "businessOutcome",
      name: "Business outcome",
      type: "text",
      visibility: "Shared",
      requiredOnDone: false,
    },
    {
      id: "reviewEvidence",
      name: "Review evidence URL",
      type: "text",
      visibility: "Internal",
      requiredOnDone: false,
    },
  ],
  milestones: [
    {
      id: "ms1",
      project: "p1",
      title: "Source access & discovery",
      phase: "Discovery",
      due: "2026-09-28",
      owner: "rk",
      status: "Complete",
      visibility: "Shared",
      issues: ["NES-101"],
    },
    {
      id: "ms2",
      project: "p1",
      title: "Reconciled data foundation",
      phase: "Data engineering",
      due: "2026-10-09",
      owner: "sp",
      status: "In progress",
      visibility: "Shared",
      issues: ["NES-102", "NES-103", "NES-104"],
      approval: "APR-101",
    },
    {
      id: "ms3",
      project: "p1",
      title: "Business acceptance",
      phase: "UAT",
      due: "2026-10-30",
      owner: "rk",
      status: "Planned",
      visibility: "Shared",
      issues: ["NES-105"],
    },
    {
      id: "ms4",
      project: "p1",
      title: "Operational handover",
      phase: "Handover",
      due: "2026-11-13",
      owner: "rk",
      status: "Planned",
      visibility: "Shared",
      issues: [],
    },
    {
      id: "ms5",
      project: "p2",
      title: "KPI definition sign-off",
      phase: "Customer review",
      due: "2026-10-02",
      owner: "mn",
      status: "At risk",
      visibility: "Shared",
      issues: [],
    },
    {
      id: "ms6",
      project: "p3",
      title: "Pilot scope agreed",
      phase: "Discovery",
      due: "2026-10-09",
      owner: "sp",
      status: "Planned",
      visibility: "Shared",
      issues: [],
    },
  ],
  risks: [
    {
      id: "risk1",
      project: "p1",
      title: "Warehouse exceptions need a source owner",
      impact: "Medium",
      owner: "sp",
      due: "2026-10-05",
      status: "Open",
      mitigation:
        "Review unresolved mappings with the inventory team before validation.",
      visibility: "Internal",
    },
    {
      id: "risk2",
      project: "p2",
      title: "KPI definitions are blocking customer review",
      impact: "High",
      owner: "mn",
      due: "2026-10-02",
      status: "Open",
      mitigation: "Book a decision session with the finance sponsor.",
      visibility: "Shared",
    },
  ],
  meetings: [
    {
      id: "meet1",
      project: "p1",
      title: "Technical alignment",
      date: "2026-09-30",
      owner: "rk",
      visibility: "Shared",
      summary:
        "Aligned the inventory model boundary and reconciliation owners.",
      decision: "Finance remains the source of truth for opening balances.",
      action: "Document the warehouse mapping exceptions",
      issue: null,
    },
  ],
  tests: [
    {
      id: "test1",
      project: "p1",
      title: "Inventory totals reconcile to source",
      criteria:
        "Agreed warehouse totals match the source report for the selected period.",
      owner: "rk",
      status: "Not run",
      visibility: "Shared",
      defect: null,
    },
    {
      id: "test2",
      project: "p1",
      title: "Finance can review reconciliation exceptions",
      criteria:
        "Exceptions have a reason, accountable owner and evidence link.",
      owner: "mn",
      status: "Not run",
      visibility: "Shared",
      defect: null,
    },
  ],
  signoffs: [],
  allocations: [
    { id: "al1", project: "p1", person: "rk", hours: 12, week: "2026-09-28" },
    { id: "al2", project: "p1", person: "sp", hours: 28, week: "2026-09-28" },
    { id: "al3", project: "p1", person: "mn", hours: 16, week: "2026-09-28" },
    { id: "al4", project: "p2", person: "mn", hours: 28, week: "2026-09-28" },
    { id: "al5", project: "p3", person: "sp", hours: 8, week: "2026-09-28" },
    { id: "al6", project: "p4", person: "ar", hours: 10, week: "2026-09-28" },
  ],
  timeEntries: [
    {
      id: "tm1",
      project: "p1",
      issue: "NES-102",
      person: "sp",
      date: "2026-09-30",
      hours: 6,
      billable: true,
      status: "Submitted",
      note: "Warehouse dimension mapping",
    },
    {
      id: "tm2",
      project: "p1",
      issue: "NES-104",
      person: "rk",
      date: "2026-09-30",
      hours: 3,
      billable: true,
      status: "Approved",
      note: "Source reconciliation review",
    },
    {
      id: "tm3",
      project: "p2",
      issue: "",
      person: "mn",
      date: "2026-09-30",
      hours: 4,
      billable: true,
      status: "Draft",
      note: "KPI workshop preparation",
    },
  ],
  commercials: [
    { project: "p1", currency: "USD", fee: 24000, budgetHours: 320 },
    { project: "p2", currency: "USD", fee: 18000, budgetHours: 240 },
    { project: "p3", currency: "EUR", fee: 12500, budgetHours: 180 },
    { project: "p4", currency: "USD", fee: 0, budgetHours: 0 },
  ],
  invoices: [
    {
      id: "INV-DEMO-01",
      project: "p1",
      title: "Discovery milestone",
      amount: 6000,
      currency: "USD",
      due: "2026-10-07",
      status: "Awaiting payment",
      source: "Manual demo",
    },
    {
      id: "INV-DEMO-02",
      project: "p2",
      title: "Initial engagement",
      amount: 4500,
      currency: "USD",
      due: "2026-09-29",
      status: "Paid",
      source: "Manual demo",
    },
  ],
  rules: [
    {
      id: "rule1",
      name: "New customer request → accountable owner",
      event: "request.created",
      enabled: false,
      action: "assign_project_lead",
    },
  ],
  audit: [],
};

export function upgradeDelivery(state) {
  const next = { ...state };
  for (const [key, value] of Object.entries(baseline))
    if (next[key] === undefined) next[key] = structuredClone(value);
  return next;
}
export function recordEvent(state, event, project, title) {
  const previous = state.audit?.[0];
  const coalesce =
    event === "issue.updated" &&
    previous?.event === event &&
    previous.project === project &&
    previous.title === title &&
    Date.now() - Date.parse(previous.at) < 2000;
  return {
    ...state,
    audit: [
      {
        id: coalesce ? previous.id : crypto.randomUUID(),
        event,
        project,
        title,
        at: new Date().toISOString(),
        actor: "ar",
      },
      ...(coalesce ? state.audit.slice(1) : state.audit || []),
    ],
  };
}
export function milestoneGate(state, item) {
  if (item.status === "Complete") return null;
  const linked = item.issues.map((id) => state.issues.find((i) => i.id === id));
  const missing = linked.filter((i) => !i || i.status !== "Done").length;
  const approval =
    item.approval && state.approvals.find((a) => a.id === item.approval);
  if (missing)
    return `${missing} linked work item${missing === 1 ? "" : "s"} still open`;
  if (item.approval && approval?.status !== "Approved")
    return "Linked approval is not approved";
  return null;
}
export function finishMilestone(state, id) {
  const item = state.milestones.find((m) => m.id === id);
  if (!item) throw new Error("Milestone not found.");
  if (item.status === "Complete") return state;
  const blocked = milestoneGate(state, item);
  if (blocked) throw new Error(blocked);
  return recordEvent(
    {
      ...state,
      milestones: state.milestones.map((m) =>
        m.id === id
          ? {
              ...m,
              status: "Complete",
              completedAt: new Date().toISOString(),
              completion: {
                issues: structuredClone(
                  state.issues.filter((i) => m.issues.includes(i.id)),
                ),
                approval: structuredClone(
                  state.approvals.find((a) => a.id === m.approval) || null,
                ),
              },
            }
          : m,
      ),
    },
    "milestone.completed",
    item.project,
    item.title,
  );
}
export function defectFromTest(state, id) {
  const test = state.tests.find((t) => t.id === id);
  if (!test || test.status !== "Failed")
    throw new Error("Only a failed test can create a defect.");
  if (test.defect) return state;
  const issue = makeIssue(state, test.project, {
    title: `UAT: ${test.title}`,
    type: "Bug",
    description: test.criteria,
    visibility: "Internal",
    sourceTest: test.id,
  });
  return recordEvent(
    {
      ...state,
      issues: [...state.issues, issue],
      tests: state.tests.map((t) =>
        t.id === id ? { ...t, defect: issue.id } : t,
      ),
    },
    "uat.defect_created",
    test.project,
    issue.title,
  );
}
export function signOff(state, project) {
  const cases = state.tests.filter((t) => t.project === project);
  if (!cases.length || cases.some((t) => t.status !== "Passed"))
    throw new Error("Every acceptance test must pass before sign-off.");
  if (
    cases.some(
      (t) =>
        t.defect &&
        state.issues.find((i) => i.id === t.defect)?.status !== "Done",
    )
  )
    throw new Error("Resolve linked defects before signing off.");
  if (state.signoffs.some((s) => s.project === project)) return state;
  return recordEvent(
    {
      ...state,
      signoffs: [
        ...state.signoffs,
        {
          id: crypto.randomUUID(),
          project,
          at: new Date().toISOString(),
          actor: "Local reviewer",
          cases: structuredClone(cases),
        },
      ],
    },
    "uat.signed_off",
    project,
    "Acceptance baseline signed off",
  );
}
export function createMeetingAction(state, id) {
  const meeting = state.meetings.find((m) => m.id === id);
  if (!meeting?.action) throw new Error("Add an action first.");
  if (meeting.issue) return state;
  const issue = makeIssue(state, meeting.project, {
    title: meeting.action,
    description: `From meeting: ${meeting.title}`,
    owner: meeting.owner,
    sourceMeeting: id,
  });
  return recordEvent(
    {
      ...state,
      issues: [...state.issues, issue],
      meetings: state.meetings.map((m) =>
        m.id === id ? { ...m, issue: issue.id } : m,
      ),
    },
    "meeting.action_created",
    meeting.project,
    issue.title,
  );
}
export function transitionTime(state, id, status) {
  const entry = state.timeEntries.find((t) => t.id === id);
  if (!entry) throw new Error("Time entry not found.");
  const allowed = {
    Draft: ["Submitted"],
    Submitted: ["Approved", "Draft"],
    Approved: [],
  };
  if (!allowed[entry.status]?.includes(status))
    throw new Error(
      "Approved time is immutable; correction requires a reversal.",
    );
  return recordEvent(
    {
      ...state,
      timeEntries: state.timeEntries.map((t) =>
        t.id === id ? { ...t, status } : t,
      ),
    },
    "time.status_changed",
    entry.project,
    `${entry.hours}h ${status.toLowerCase()}`,
  );
}
export function instantiateTemplate(state, templateId, data) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template || !data.name?.trim() || !data.customer)
    throw new Error("Choose a customer and enter a project name.");
  const key = data.key?.trim().toUpperCase();
  if (
    !/^[A-Z][A-Z0-9]{1,5}$/.test(key) ||
    state.projects.some((p) => p.key === key)
  )
    throw new Error("Use a unique 2–6 character project key.");
  const project = {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    key,
    customer: data.customer,
    owner: data.owner || "rk",
    health: "Draft",
    phase: template.phases[0],
    start: data.start || "",
    due: "",
    description: template.description,
    color: "teal",
    template: template.id,
    templateVersion: 1,
  };
  let next = {
    ...state,
    projects: [project, ...state.projects],
    issues: [...state.issues],
  };
  for (const [index, title] of template.tasks.entries())
    next.issues.push(
      makeIssue(next, project.id, {
        title,
        phase: template.phases[Math.min(index, template.phases.length - 1)],
        templateItem: index,
      }),
    );
  next.milestones = [
    ...state.milestones,
    ...template.phases.map((phase, index) => ({
      id: crypto.randomUUID(),
      project: project.id,
      title: phase,
      phase,
      due: "",
      owner: project.owner,
      status: "Planned",
      visibility: "Internal",
      issues: next.issues
        .filter((i) => i.project === project.id && i.phase === phase)
        .map((i) => i.id),
    })),
  ];
  return {
    state: recordEvent(
      next,
      "project.created",
      project.id,
      `Created from ${template.name} v1`,
    ),
    project,
  };
}
export function portfolioStats(state) {
  return {
    projects: state.projects.length,
    risks: state.risks.filter((r) => r.status === "Open").length,
    approvals: state.approvals.filter((a) => a.status === "Pending").length,
    hours: state.timeEntries
      .filter((t) => t.status === "Approved")
      .reduce((n, t) => n + t.hours, 0),
  };
}
export function estimateRequest(state, id, estimate) {
  const request = state.requests.find((r) => r.id === id);
  if (request?.issue)
    throw new Error(
      "This request already has delivery work. Create a separate change request for revised scope.",
    );
  if (
    !request ||
    !estimate.scope?.trim() ||
    !estimate.criteria?.trim() ||
    !(estimate.hours > 0)
  )
    throw new Error(
      "Provide scope, acceptance criteria and positive effort before requesting approval.",
    );
  const version = (request.estimateVersion || 0) + 1;
  const approval = {
    id: crypto.randomUUID(),
    project: request.project,
    request: id,
    title: `Estimate: ${request.title}`,
    summary: estimate.scope,
    version,
    status: "Pending",
    visibility: "Shared",
    estimate: structuredClone(estimate),
  };
  return recordEvent(
    {
      ...state,
      requests: state.requests.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "Awaiting approval",
              estimate: structuredClone(estimate),
              estimateVersion: version,
              approval: approval.id,
            }
          : r,
      ),
      approvals: [
        approval,
        ...state.approvals.map((a) =>
          a.request === id && a.status === "Pending"
            ? { ...a, status: "Superseded" }
            : a,
        ),
      ],
    },
    "request.estimate_published",
    request.project,
    `Estimate v${version} requested`,
  );
}
export function decideApproval(state, id, status, comment = "") {
  const approval = state.approvals.find((a) => a.id === id);
  if (!approval) throw new Error("Approval unavailable.");
  if (approval.status === status) return state;
  if (approval.status !== "Pending")
    throw new Error(
      "This approval round is frozen. Request a new version for another decision.",
    );
  if (!["Approved", "Changes requested"].includes(status))
    throw new Error("Choose a valid approval decision.");
  if (status === "Changes requested" && !comment.trim())
    throw new Error("Explain the requested change.");
  return recordEvent(
    {
      ...state,
      approvals: state.approvals.map((a) =>
        a.id === id
          ? { ...a, status, comment, decidedAt: new Date().toISOString() }
          : a,
      ),
      requests: state.requests.map((r) =>
        r.approval === id
          ? {
              ...r,
              status:
                status === "Approved" ? "Approved" : "Clarification needed",
            }
          : r,
      ),
    },
    "approval.decided",
    approval.project,
    `${approval.title} v${approval.version}: ${status}`,
  );
}
export function requestToWork(state, id) {
  const request = state.requests.find((r) => r.id === id);
  if (!request) throw new Error("Request unavailable.");
  if (request.issue) return state;
  const approval = state.approvals.find((a) => a.id === request.approval);
  if (
    approval?.status !== "Approved" ||
    approval.version !== request.estimateVersion
  )
    throw new Error(
      "Approve the current estimate version before creating delivery work.",
    );
  const issue = makeIssue(state, request.project, {
    title: request.title,
    description: `${request.estimate.scope}\nAcceptance: ${request.estimate.criteria}\nExclusions: ${request.estimate.exclusions || "Not specified"}`,
    owner:
      request.owner ||
      state.projects.find((p) => p.id === request.project).owner,
    sourceRequest: id,
  });
  return recordEvent(
    {
      ...state,
      issues: [...state.issues, issue],
      requests: state.requests.map((r) =>
        r.id === id ? { ...r, issue: issue.id, status: "Scheduled" } : r,
      ),
    },
    "request.work_created",
    request.project,
    `Linked ${id} to ${issue.id}`,
  );
}
export function createRequest(state, data) {
  const project = state.projects.find((p) => p.id === data.project);
  if (!project || !data.title?.trim())
    throw new Error("A project and request title are required.");
  const assign = state.rules.some(
    (r) =>
      r.enabled &&
      r.event === "request.created" &&
      r.action === "assign_project_lead",
  );
  const request = {
    ...data,
    id: crypto.randomUUID(),
    status: "Submitted",
    visibility: "Shared",
    owner: assign ? project.owner : null,
  };
  return recordEvent(
    { ...state, requests: [request, ...state.requests] },
    "request.created",
    project.id,
    `${request.title}${assign ? " · Lead assigned by local rule" : ""}`,
  );
}
export function validateIssuePatch(state, issue, patch) {
  if (patch.status === "Done") {
    const dependencies = patch.dependencies || issue.dependencies || [];
    if (
      dependencies.some(
        (id) => state.issues.find((i) => i.id === id)?.status !== "Done",
      )
    )
      throw new Error(
        "Complete blocking dependencies before marking this item Done.",
      );
    for (const field of state.fieldDefinitions || [])
      if (
        field.requiredOnDone &&
        !(patch.customFields || issue.customFields || {})[field.id]
      )
        throw new Error(
          `Complete ${field.name} before marking this item Done.`,
        );
  }
  if (patch.parent) {
    const parent = state.issues.find((i) => i.id === patch.parent);
    if (!parent || parent.project !== issue.project || parent.id === issue.id)
      throw new Error("Choose a parent in the same project.");
    let cursor = parent;
    const seen = new Set([issue.id]);
    while (cursor) {
      if (seen.has(cursor.id))
        throw new Error("Hierarchy cannot contain a cycle.");
      seen.add(cursor.id);
      cursor = state.issues.find((i) => i.id === cursor.parent);
    }
  }
  if (patch.dependencies)
    for (const id of patch.dependencies) {
      const dependency = state.issues.find((i) => i.id === id);
      if (
        !dependency ||
        dependency.project !== issue.project ||
        id === issue.id
      )
        throw new Error(
          "Dependencies must refer to other work in this project.",
        );
      const visit = (candidate, seen = new Set()) => {
        if (candidate.id === issue.id) return true;
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return (candidate.dependencies || []).some((key) => {
          const next = state.issues.find((i) => i.id === key);
          return next && visit(next, seen);
        });
      };
      if (visit(dependency))
        throw new Error("Dependencies cannot contain a cycle.");
    }
  return true;
}
export function createHandoffProject(state, id, data) {
  const handoff = state.handoffs.find((h) => h.id === id);
  if (!handoff || handoff.stage !== "Closed won")
    throw new Error("Only closed-won handoffs can create an engagement.");
  if (handoff.project)
    return {
      state,
      project: state.projects.find((p) => p.id === handoff.project),
    };
  const result = instantiateTemplate(state, handoff.template, {
    ...data,
    name: handoff.name,
    customer: handoff.customer,
    owner: handoff.owner,
  });
  result.state.handoffs = state.handoffs.map((h) =>
    h.id === id ? { ...h, project: result.project.id } : h,
  );
  result.state.projects = result.state.projects.map((p) =>
    p.id === result.project.id
      ? { ...p, sourceHandoff: id, description: handoff.scope }
      : p,
  );
  return result;
}
export function startSprint(state, project, data) {
  if (state.sprints.some((s) => s.project === project && s.status === "Active"))
    throw new Error("Finish the active sprint before starting another.");
  if (!data.name?.trim() || !data.start || !data.end || data.end < data.start)
    throw new Error("Enter a sprint name and valid start/end dates.");
  const items = state.issues.filter(
    (i) => i.project === project && i.sprint && i.status !== "Done",
  );
  if (!items.length)
    throw new Error("Add work to the current sprint before starting.");
  const sprint = {
    ...data,
    id: crypto.randomUUID(),
    project,
    status: "Active",
    baseline: structuredClone(items),
    startedAt: new Date().toISOString(),
  };
  return recordEvent(
    {
      ...state,
      sprints: [sprint, ...state.sprints],
      issues: state.issues.map((i) =>
        i.project === project && i.status === "Done" && i.sprint
          ? { ...i, sprint: false }
          : i,
      ),
    },
    "sprint.started",
    project,
    data.name,
  );
}
export function completeSprint(state, id) {
  const sprint = state.sprints.find((s) => s.id === id);
  if (!sprint || sprint.status !== "Active")
    throw new Error("Select an active sprint.");
  const items = state.issues.filter(
    (i) => i.project === sprint.project && i.sprint,
  );
  return recordEvent(
    {
      ...state,
      sprints: state.sprints.map((s) =>
        s.id === id
          ? {
              ...s,
              status: "Complete",
              completedAt: new Date().toISOString(),
              completion: structuredClone(items),
            }
          : s,
      ),
      issues: state.issues.map((i) =>
        i.project === sprint.project && i.sprint ? { ...i, sprint: false } : i,
      ),
    },
    "sprint.completed",
    sprint.project,
    `${sprint.name} completed; unfinished work returned to backlog`,
  );
}
