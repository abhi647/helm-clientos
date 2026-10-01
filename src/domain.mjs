export const PEOPLE = [
  { id: "ar", name: "Abhijit", initials: "AB", color: "teal" },
  { id: "rk", name: "Rahul Kumar", initials: "RK", color: "blue" },
  { id: "sp", name: "Sahil Patel", initials: "SP", color: "purple" },
  { id: "mn", name: "Meera Nair", initials: "MN", color: "rose" },
];
export const STATUSES = ["To do", "In progress", "In review", "Done"];
export const SEED = {
  version: 1,
  customers: [
    {
      id: "nesma",
      name: "Nesma Group",
      contact: "Michel",
      email: "michel@example.com",
      industry: "Enterprise services",
    },
    {
      id: "cbd",
      name: "CBD Group",
      contact: "Sara",
      email: "sara@example.com",
      industry: "Financial services",
    },
    {
      id: "h2o",
      name: "H2O Wateropslag",
      contact: "Thomas",
      email: "thomas@example.com",
      industry: "Manufacturing",
    },
    {
      id: "orbit",
      name: "Orbit Retail",
      contact: "Alex",
      email: "alex@example.com",
      industry: "Retail",
    },
  ],
  projects: [
    {
      id: "p1",
      name: "Infor LN integration",
      key: "NES",
      customer: "nesma",
      owner: "rk",
      health: "On track",
      phase: "Data engineering",
      start: "2026-09-21",
      due: "2026-11-13",
      description:
        "A connected data foundation for finance, inventory and management reporting.",
      color: "teal",
    },
    {
      id: "p2",
      name: "Executive reporting",
      key: "CBD",
      customer: "cbd",
      owner: "mn",
      health: "Needs attention",
      phase: "Customer review",
      start: "2026-09-14",
      due: "2026-10-30",
      description: "One trusted view of operational and financial performance.",
      color: "blue",
    },
    {
      id: "p3",
      name: "Demand planning pilot",
      key: "H2O",
      customer: "h2o",
      owner: "sp",
      health: "On track",
      phase: "Discovery",
      start: "2026-10-01",
      due: "2026-11-20",
      description: "An actionable planning pilot grounded in customer demand.",
      color: "purple",
    },
    {
      id: "p4",
      name: "Commerce data platform",
      key: "ORB",
      customer: "orbit",
      owner: "ar",
      health: "Draft",
      phase: "Planning",
      start: "2026-10-12",
      due: "2026-12-04",
      description: "A unified platform for retail data and decision making.",
      color: "amber",
    },
  ],
  issues: [
    {
      id: "NES-101",
      project: "p1",
      title: "Confirm source system access",
      type: "Task",
      status: "Done",
      owner: "rk",
      points: 3,
      phase: "Discovery",
      visibility: "Shared",
      description: "Validate access to the agreed Infor LN source environment.",
      due: "2026-09-28",
      sprint: true,
      comments: [],
    },
    {
      id: "NES-102",
      project: "p1",
      title: "Map warehouse hierarchy",
      type: "Story",
      status: "In progress",
      owner: "sp",
      points: 5,
      phase: "Data engineering",
      visibility: "Internal",
      description:
        "Map source warehouses to the canonical inventory dimension. Document exceptions and validate mappings.",
      due: "2026-10-05",
      sprint: true,
      comments: [],
    },
    {
      id: "NES-103",
      project: "p1",
      title: "Build inventory semantic model",
      type: "Story",
      status: "To do",
      owner: "mn",
      points: 8,
      phase: "Data engineering",
      visibility: "Internal",
      description:
        "Implement the governed inventory model and validate agreed measures.",
      due: "2026-10-09",
      sprint: true,
      comments: [],
    },
    {
      id: "NES-104",
      project: "p1",
      title: "Validate financial reconciliation",
      type: "Task",
      status: "In review",
      owner: "rk",
      points: 3,
      phase: "Data engineering",
      visibility: "Shared",
      description: "Compare extracted totals with source-system balances.",
      due: "2026-10-06",
      sprint: true,
      comments: [],
    },
    {
      id: "NES-105",
      project: "p1",
      title: "Prepare customer UAT checklist",
      type: "Task",
      status: "To do",
      owner: "ar",
      points: 2,
      phase: "UAT",
      visibility: "Shared",
      description:
        "Create test steps and acceptance criteria for customer validation.",
      due: "2026-10-15",
      sprint: false,
      comments: [],
    },
    {
      id: "NES-106",
      project: "p1",
      title: "Resolve duplicate product mappings",
      type: "Bug",
      status: "In progress",
      owner: "sp",
      points: 3,
      phase: "Data engineering",
      visibility: "Internal",
      description: "Inspect duplicates and implement validated mapping rules.",
      due: "2026-10-07",
      sprint: true,
      comments: [],
    },
    {
      id: "CBD-101",
      project: "p2",
      title: "Review executive dashboard",
      type: "Task",
      status: "In review",
      owner: "mn",
      points: 5,
      phase: "UAT",
      visibility: "Shared",
      description: "Customer review of the proposed reporting layout.",
      due: "2026-10-02",
      sprint: true,
      comments: [],
    },
    {
      id: "H2O-101",
      project: "p3",
      title: "Complete planning discovery",
      type: "Story",
      status: "To do",
      owner: "sp",
      points: 5,
      phase: "Discovery",
      visibility: "Shared",
      description: "Confirm demand sources and acceptance measures.",
      due: "2026-10-08",
      sprint: false,
      comments: [],
    },
  ],
  requests: [
    {
      id: "REQ-101",
      project: "p1",
      title: "Add regional sales forecast",
      description: "We need region-level forecasting with product drilldown.",
      type: "Enhancement",
      status: "Under review",
      visibility: "Shared",
    },
    {
      id: "REQ-102",
      project: "p2",
      title: "Confirm dashboard KPI definitions",
      description:
        "Please confirm the revenue and margin definitions before UAT.",
      type: "Clarification",
      status: "Clarification needed",
      visibility: "Shared",
    },
  ],
  approvals: [
    {
      id: "APR-101",
      project: "p1",
      title: "Data mapping specification",
      summary:
        "Review the agreed warehouse and product mapping rules before implementation.",
      version: 1,
      status: "Pending",
      comment: "",
      decidedAt: null,
    },
  ],
  updates: [
    {
      id: "UPD-101",
      project: "p1",
      title: "Data foundation is taking shape",
      body: "Source access is confirmed. The team is mapping warehouse hierarchies and validating financial reconciliation. Next, we will prepare the inventory model for review.",
      visibility: "Shared",
      date: "2026-10-01",
    },
  ],
  documents: [],
  drafts: {},
  workflow: STATUSES,
  times: [],
};
export function progress(issues, project) {
  const list = issues.filter((i) => i.project === project);
  return list.length
    ? Math.round(
        (100 * list.filter((i) => i.status === "Done").length) / list.length,
      )
    : 0;
}
export function makeIssue(state, project, data) {
  const p = state.projects.find((p) => p.id === project);
  const numbers = state.issues
    .filter((i) => i.project === project)
    .map((i) => Number(i.id.split("-").at(-1)));
  return {
    id: `${p.key}-${Math.max(100, ...numbers) + 1}`,
    project,
    type: "Task",
    status: state.workflow[0],
    owner: p.owner,
    points: 0,
    phase: "Delivery",
    visibility: "Internal",
    description: "",
    due: "",
    sprint: false,
    comments: [],
    ...data,
  };
}
export function publishDraft(state, project) {
  const draft = state.drafts[project];
  if (!draft) throw new Error("Create a draft first.");
  if (draft.published) return state;
  if (
    !draft.items.length ||
    draft.items.some((i) => !i.reviewed || !i.title.trim())
  )
    throw new Error("Review every plan item before publishing.");
  if (!draft.pmApproved) throw new Error("PM approval is required.");
  let next = { ...state, issues: [...state.issues] };
  for (const item of draft.items)
    next.issues.push(
      makeIssue(next, project, {
        title: item.title,
        description: item.description,
        phase: item.phase,
        points: Number(item.points) || 0,
        sourcePlan:{project,draftVersion:draft.version || 1,itemId:item.id,classification:item.classification || 'Assumption',source:item.source || ''},
      }),
    );
  next.drafts = {
    ...state.drafts,
    [project]: {
      ...draft,
      published: true,
      publishedAt: new Date().toISOString(),
    },
  };
  next.projects = state.projects.map((p) =>
    p.id === project && p.health === "Draft"
      ? { ...p, health: "Ready to start", phase: draft.items[0].phase }
      : p,
  );
  return next;
}
export function localDraft(text) {
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 240)
    .slice(0, 12);
  return {
    source: text,
    mode: "manual",
    pmApproved: false,
    published: false,
    items: lines.map((line, index) => ({
      id: `item-${index}`,
      title: line,
      description: "Review the source text and define acceptance criteria.",
      phase: "Scope review",
      points: 0,
      classification: "Source excerpt",
      source: line,
      reviewed: false,
    })),
  };
}
