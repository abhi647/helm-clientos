"use client";
import { useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  Flag,
  Check,
  Clock,
  CalendarDays,
  Diamond,
  Layers,
  Users,
  FileCheck2,
  ShieldCheck,
  Link2,
  SlidersHorizontal,
  Sparkles,
  Circle,
  CircleCheck,
  Activity,
  CheckCheck,
  Play,
  LockKeyhole,
} from "lucide-react";
import { PEOPLE, progress } from "../domain.mjs";
import {
  SCENARIO_DATE,
  STAGES,
  TEMPLATES,
  portfolioStats,
  milestoneGate,
  finishMilestone,
  defectFromTest,
  signOff,
  createMeetingAction,
  transitionTime,
  instantiateTemplate,
  recordEvent,
  createHandoffProject,
} from "../delivery-domain.mjs";
import {
  Button,
  Avatar,
  Badge,
  Panel,
  Modal,
  Field,
  Empty,
  Progress,
  Visibility,
} from "./ui";

const shortDate = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "Unscheduled";
const client = (state, p) =>
  state.customers.find((c) => c.id === p.customer)?.name || "Customer";
const money = (amount, currency) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
const hours = (value) => `${Number(value.toFixed(1))}h`;
function Title({ kicker, title, description, children }) {
  return (
    <div className="delivery-title">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="title-actions">{children}</div>
    </div>
  );
}
function Metric({ label, value, note, accent = false }) {
  return (
    <div className={`delivery-metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Segments({ items }) {
  return (
    <div className="segment-control">
      {items.map(([label, active, action, count]) => (
        <button
          key={label}
          className={active ? "selected" : ""}
          onClick={action}
        >
          {label}
          {count !== undefined && <span>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ControlRoom({ state, nav, setModal }) {
  const [view, setView] = useState("All engagements"),
    [query, setQuery] = useState("");
  const stats = portfolioStats(state);
  const projects = state.projects.filter(
    (p) =>
      (view !== "At risk" || p.health === "Needs attention") &&
      (view !== "Planning" || ["Draft", "Ready to start"].includes(p.health)) &&
      `${p.name} ${client(state, p)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const upcoming = state.milestones
    .filter((m) => m.status !== "Complete" && m.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 4);
  const exceptions = [
    ...state.risks
      .filter((r) => r.status === "Open" && r.impact === "High")
      .map((r) => ({
        ...r,
        kind: "risk",
        tab: "Risks",
        label: "Decision needed",
      })),
    ...state.approvals
      .filter((a) => a.status === "Pending")
      .map((a) => ({ ...a, kind: "approval", label: "Approval pending" })),
  ];
  return (
    <div className="control-room">
      <Title
        kicker="DELIVERY OPERATIONS / 01 OCT 2026 · SCENARIO"
        title="Delivery, in focus."
        description="The commitments, people and decisions behind every client engagement."
      >
        <Button onClick={() => nav("Templates")}>
          <Layers size={15} />
          Use a template
        </Button>
        <Button
          variant="primary"
          onClick={() => setModal({ type: "createProject" })}
        >
          <Plus size={15} />
          New engagement
        </Button>
      </Title>
      <div className="control-layout">
        <div className="control-primary">
          <div className="metrics-band">
            <Metric
              label="Active engagements"
              value={stats.projects.toString().padStart(2, "0")}
              note={`${state.customers.length} customer relationships`}
            />
            <Metric
              label="Delivery risks"
              value={stats.risks.toString().padStart(2, "0")}
              note="Open in the risk register"
              accent
            />
            <Metric
              label="Awaiting decisions"
              value={stats.approvals.toString().padStart(2, "0")}
              note="Pending approval rounds"
            />
            <Metric
              label="Approved effort"
              value={hours(stats.hours)}
              note="Recorded in the local ledger"
            />
          </div>
          <div className="portfolio-heading">
            <div>
              <span className="section-kicker">YOUR DELIVERY PORTFOLIO</span>
              <h2>Every promise. One perspective.</h2>
            </div>
            <button className="inline-link" onClick={() => nav("Reports")}>
              Delivery report <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="portfolio-toolbar">
            <Segments
              items={["All engagements", "At risk", "Planning"].map((v) => [
                v,
                view === v,
                () => setView(v),
              ])}
            />
            <label className="portfolio-search">
              <Search size={15} />
              <input
                aria-label="Search delivery portfolio"
                placeholder="Find an engagement"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="delivery-portfolio">
            <div className="portfolio-table-head">
              <span>Engagement</span>
              <span>Delivery stage</span>
              <span>Progress</span>
              <span>Next checkpoint</span>
              <span>Lead</span>
            </div>
            {projects.map((p) => {
              const milestone = state.milestones
                .filter((m) => m.project === p.id && m.status !== "Complete")
                .sort((a, b) =>
                  (a.due || "9999").localeCompare(b.due || "9999"),
                )[0];
              const issueCount = state.issues.filter(
                (i) => i.project === p.id,
              ).length;
              return (
                <button
                  className="portfolio-project"
                  key={p.id}
                  onClick={() => nav("Project", p.id)}
                >
                  <span className="portfolio-identity">
                    <span className={`monogram ${p.color}`}>
                      {client(state, p).slice(0, 1)}
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {client(state, p)} <i>·</i> {p.key}
                      </small>
                    </span>
                  </span>
                  <span className="portfolio-stage">
                    <Badge>{p.health}</Badge>
                    <small>{p.phase}</small>
                  </span>
                  <span className="portfolio-progress">
                    <Progress value={progress(state.issues, p.id)} />
                    <small>{issueCount} work items</small>
                  </span>
                  <span className="checkpoint">
                    <b>
                      {milestone ? shortDate(milestone.due) : shortDate(p.due)}
                    </b>
                    <small>
                      {milestone?.title || "Plan not yet baselined"}
                    </small>
                  </span>
                  <Avatar id={p.owner} />
                </button>
              );
            })}
            {!projects.length && (
              <Empty
                title="No matching engagements"
                text="Try another customer or engagement name."
              />
            )}
          </div>
          <div className="portfolio-bottom">
            <span>
              <LockKeyhole size={13} />
              Internal delivery perspective
            </span>
            <span>Scenario data · No predictive scores or invented trends</span>
          </div>
          <div className="delivery-bottom-grid">
            <Panel
              title="Critical path to a decision"
              subtitle="Resolve the context, not just the notification."
              action={<Badge tone="neutral">{exceptions.length} open</Badge>}
            >
              {exceptions.map((item) => (
                <button
                  className="decision-row"
                  key={item.id}
                  onClick={() =>
                    item.kind === "approval"
                      ? setModal({ type: "approval", id: item.id })
                      : nav("Project", item.project, item.tab)
                  }
                >
                  <span className={`decision-symbol ${item.kind}`}>
                    {item.kind === "approval" ? (
                      <FileCheck2 size={18} />
                    ) : (
                      <Flag size={18} />
                    )}
                  </span>
                  <span>
                    <small>
                      {item.label} ·{" "}
                      {state.projects.find((p) => p.id === item.project)?.name}
                    </small>
                    <b>{item.title}</b>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {!exceptions.length && (
                <Empty
                  title="No critical decisions pending"
                  text="New high-impact risks and approval rounds appear here."
                />
              )}
            </Panel>
            <Panel
              title="Your delivery system"
              subtitle="Move between connected operational workspaces."
            >
              <div className="system-links">
                {[
                  ["Resources", "Capacity & team allocation", Users],
                  ["Time", "Effort & review ledger", Clock],
                  ["Finance", "Billing readiness & invoices", FileCheck2],
                  ["Templates", "Repeatable delivery patterns", Layers],
                ].map(([page, text, Icon]) => (
                  <button key={page} onClick={() => nav(page)}>
                    <Icon size={18} />
                    <span>
                      <b>{page}</b>
                      <small>{text}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </div>
        <aside className="delivery-brief">
          <div className="brief-heading">
            <span className="section-kicker">THE DELIVERY BRIEF</span>
            <span className="brief-date">01 / 10</span>
          </div>
          <h2>
            What moves
            <br />
            the week forward.
          </h2>
          <p>Follow the next commitment, then the action that unlocks it.</p>
          <div className="brief-section">
            <span className="section-kicker">UPCOMING CHECKPOINTS</span>
            {upcoming.map((m, index) => (
              <button
                className="brief-checkpoint"
                key={m.id}
                onClick={() => nav("Project", m.project, "Timeline")}
              >
                <span className="checkpoint-index">0{index + 1}</span>
                <span>
                  <small>
                    {shortDate(m.due)} ·{" "}
                    {state.projects.find((p) => p.id === m.project)?.key}
                  </small>
                  <b>{m.title}</b>
                  <Badge>{m.status}</Badge>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {!upcoming.length && <p>No dated checkpoints yet.</p>}
          </div>
          <div className="brief-scope">
            <Sparkles size={22} />
            <h3>Scope before schedule.</h3>
            <p>
              Turn your SOW into a reviewed delivery plan. Keep assumptions
              separate from commitments.
            </p>
            <Button
              onClick={() =>
                nav(
                  "Project",
                  state.projects.find((p) => p.health === "Draft")?.id ||
                    state.projects[0].id,
                  "Planning",
                )
              }
            >
              Open planning studio <ArrowRight size={14} />
            </Button>
          </div>
          <div className="brief-foot">
            <span className="status-dot" />
            Browser-local workspace
            <br />
            <small>Cloud services are not connected.</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function EngagementOverview({ state, project, nav, portal }) {
  const issues = state.issues.filter(
    (i) => i.project === project.id && (!portal || i.visibility === "Shared"),
  );
  const milestones = state.milestones.filter(
    (m) => m.project === project.id && (!portal || m.visibility === "Shared"),
  );
  const risks = state.risks.filter(
    (r) =>
      r.project === project.id &&
      r.status === "Open" &&
      (!portal || r.visibility === "Shared"),
  );
  const next = milestones
    .filter((m) => m.status !== "Complete")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))[0];
  const allocations = state.allocations.filter((a) => a.project === project.id);
  const percent = progress(issues, project.id);
  return (
    <div className="engagement-overview">
      <div className="engagement-summary">
        <div className="engagement-summary-main">
          <span className="section-kicker">ENGAGEMENT BRIEF</span>
          <h2>
            {project.description ||
              "Define the delivery outcome and the people accountable for it."}
          </h2>
          <div className="engagement-dates">
            <span>
              <CalendarDays size={15} />
              {shortDate(project.start)} kickoff
            </span>
            <span>
              <Flag size={15} />
              {shortDate(project.due)} target
            </span>
            <span>
              <Avatar id={project.owner} size="small" />
              Delivery lead
            </span>
          </div>
        </div>
        <div className="engagement-progress">
          <strong>
            {percent}
            <span>%</span>
          </strong>
          <Progress value={percent} />
          <small>
            {issues.filter((i) => i.status === "Done").length} of{" "}
            {issues.length} {portal ? "shared " : ""}work items complete
          </small>
        </div>
      </div>
      <div className="engagement-strip">
        {STAGES.map((stage, index) => {
          const active =
            project.health === "Draft"
              ? 1
              : project.phase === "UAT"
                ? 4
                : project.phase === "Handover"
                  ? 5
                  : project.phase === "Customer review"
                    ? 3
                    : project.phase === "Discovery"
                      ? 1
                      : 2;
          return (
            <button
              key={stage}
              onClick={() =>
                nav(
                  "Project",
                  project.id,
                  index === 1 && !portal
                    ? "Planning"
                    : index === 4
                      ? "UAT"
                      : "Timeline",
                )
              }
              className={index === active ? "current" : ""}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage}
              <ChevronRight size={13} />
            </button>
          );
        })}
      </div>
      <div className="engagement-grid">
        <div>
          <Panel
            title="Delivery milestones"
            subtitle="Real dates, linked work and explicit completion gates."
            action={
              <button
                className="inline-link"
                onClick={() => nav("Project", project.id, "Timeline")}
              >
                Open timeline <ArrowUpRight size={14} />
              </button>
            }
          >
            <div className="milestone-list">
              {milestones.map((m) => (
                <button
                  className="milestone-line"
                  key={m.id}
                  onClick={() => nav("Project", project.id, "Timeline")}
                >
                  <span
                    className={`milestone-node ${m.status === "Complete" ? "complete" : ""}`}
                  >
                    {m.status === "Complete" ? (
                      <Check size={12} />
                    ) : (
                      <Diamond size={12} />
                    )}
                  </span>
                  <span>
                    <b>{m.title}</b>
                    <small>
                      {m.phase} ·{" "}
                      {
                        m.issues.filter(
                          (id) =>
                            !portal ||
                            state.issues.some(
                              (i) => i.id === id && i.visibility === "Shared",
                            ),
                        ).length
                      }{" "}
                      {portal ? "shared" : "linked"} work items
                    </small>
                  </span>
                  <span>
                    <b>{shortDate(m.due)}</b>
                    <Badge>{m.status}</Badge>
                  </span>
                </button>
              ))}
            </div>
            {!milestones.length && (
              <Empty
                title="Define the delivery checkpoints"
                text="Add milestones in Timeline, then link the work that delivers them."
              />
            )}
          </Panel>
          <Panel
            title="Risk & dependency register"
            subtitle="Keep the blocker, mitigation and owner together."
            action={
              <button
                className="inline-link"
                onClick={() => nav("Project", project.id, "Risks")}
              >
                View register <ArrowUpRight size={14} />
              </button>
            }
          >
            {risks.map((r) => (
              <div className="risk-preview" key={r.id}>
                <span className="risk-indicator" />
                <div>
                  <b>{r.title}</b>
                  <p>{r.mitigation}</p>
                  <small>
                    {r.impact} impact · Follow up {shortDate(r.due)}
                  </small>
                </div>
                <Avatar id={r.owner} />
              </div>
            ))}
            {!risks.length && (
              <Empty
                title="No open risks"
                text="Record delivery risks as they emerge."
              />
            )}
          </Panel>
        </div>
        <aside>
          <div className="next-checkpoint-card">
            <span className="section-kicker">NEXT COMMITMENT</span>
            <Diamond size={22} />
            <h2>{next?.title || "Establish the delivery baseline"}</h2>
            <p>
              {next
                ? `${shortDate(next.due)} · ${next.phase}`
                : "Create a reviewed plan before committing delivery dates."}
            </p>
            <Button
              onClick={() =>
                nav(
                  "Project",
                  project.id,
                  next ? "Timeline" : portal ? "Work" : "Planning",
                )
              }
            >
              Review {next ? "checkpoint" : "plan"} <ArrowRight size={14} />
            </Button>
          </div>
          <Panel
            title="The delivery team"
            subtitle={
              portal
                ? "Your accountable delivery partners."
                : "Capacity allocated for week of 28 Sep."
            }
          >
            <div className="team-list">
              {[
                ...new Set([
                  project.owner,
                  ...allocations.map((a) => a.person),
                ]),
              ].map((id) => (
                <div key={id}>
                  <Avatar id={id} label />
                  <small>
                    {id === project.owner
                      ? "Delivery lead"
                      : portal
                        ? "Delivery team"
                        : hours(
                            allocations
                              .filter((a) => a.person === id)
                              .reduce((n, a) => n + a.hours, 0),
                          ) + " allocated"}
                  </small>
                </div>
              ))}
            </div>
            {!portal && (
              <button className="team-manage" onClick={() => nav("Resources")}>
                Manage allocation <ArrowUpRight size={14} />
              </button>
            )}
          </Panel>
          <div className="context-card">
            <ShieldCheck size={18} />
            <div>
              <b>Sharing is deliberate</b>
              <p>
                {portal
                  ? "You see the work and deliverables explicitly shared with this customer."
                  : "Internal work stays internal. Preview the customer perspective before sharing."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const commonFields = [
  { key: "title", label: "Title", required: true },
  {
    key: "owner",
    label: "Accountable owner",
    options: PEOPLE.map((p) => [p.id, p.name]),
  },
  { key: "visibility", label: "Audience", options: ["Internal", "Shared"] },
];
function RecordEditor({ title, fields, data, onSave, onClose }) {
  const [values, setValues] = useState(data),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="modal-body record-editor"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const form = new FormData(e.currentTarget);
            const submitted = { ...values };
            for (const field of fields)
              submitted[field.key] =
                field.type === "number"
                  ? Number(form.get(field.key))
                  : form.get(field.key);
            onSave(submitted);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.options ? (
              <select
                name={f.key}
                value={values[f.key] ?? ""}
                required={f.required}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
              >
                {f.options.map((o) => (
                  <option
                    key={Array.isArray(o) ? o[0] : o}
                    value={Array.isArray(o) ? o[0] : o}
                  >
                    {Array.isArray(o) ? o[1] : o}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.key}
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
              />
            ) : (
              <input
                name={f.key}
                type={f.type || "text"}
                min={f.min}
                max={f.max}
                step={f.step}
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [f.key]:
                      f.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
          </Field>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save record <Check size={14} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function EngagementEditor({
  state,
  setState,
  project,
  onClose,
  setNotice,
}) {
  return (
    <RecordEditor
      title="Engagement settings"
      data={project}
      onClose={onClose}
      fields={[
        { key: "name", label: "Engagement name", required: true },
        { key: "description", label: "Delivery outcome", type: "textarea" },
        {
          key: "owner",
          label: "Delivery lead",
          options: PEOPLE.map((p) => [p.id, p.name]),
        },
        {
          key: "health",
          label: "Assessed delivery health",
          options: ["Draft", "Ready to start", "On track", "Needs attention"],
        },
        {
          key: "healthReason",
          label: "Health assessment reason",
          type: "textarea",
        },
        { key: "start", label: "Kickoff date", type: "date" },
        { key: "due", label: "Target completion", type: "date" },
      ]}
      onSave={(values) => {
        if (values.start && values.due && values.due < values.start)
          throw new Error("Target completion must follow kickoff.");
        setState((s) =>
          recordEvent(
            {
              ...s,
              projects: s.projects.map((p) =>
                p.id === project.id
                  ? {
                      ...p,
                      ...values,
                      healthAssessedAt: new Date().toISOString(),
                    }
                  : p,
              ),
            },
            "project.updated",
            project.id,
            `Updated ${values.name}`,
          ),
        );
        onClose();
        setNotice("Engagement settings saved locally.");
      }}
    />
  );
}

export function DeliveryModule(props) {
  const { module, state, setState, project, portal, nav, setNotice } = props;
  const [editor, setEditor] = useState(null),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const close = useCallback(() => setEditor(null), []);
  const scope = (rows) =>
    rows.filter(
      (r) =>
        (!props.scoped || r.project === project.id) &&
        (!portal || (r.project === project.id && r.visibility === "Shared")),
    );
  const mutate = (fn, message) => {
    try {
      setState(fn(state));
      setNotice(message);
    } catch (err) {
      setNotice(err.message);
    }
  };
  const run = (fn, message) => {
    try {
      const next = fn(state);
      setState(next);
      setNotice(message);
    } catch (err) {
      setNotice(err.message);
    }
  };
  const saveRecord = (collection, values, id) => {
    if (values.title !== undefined && !values.title.trim())
      throw new Error("Enter a descriptive title.");
    const record = {
      ...values,
      id: id || crypto.randomUUID(),
      project: values.project || project.id,
    };
    setState((s) =>
      recordEvent(
        {
          ...s,
          [collection]: id
            ? s[collection].map((r) => (r.id === id ? record : r))
            : [record, ...s[collection]],
        },
        `${collection}.${id ? "updated" : "created"}`,
        record.project,
        record.title || "Record saved",
      ),
    );
    close();
    setNotice("Saved in this browser.");
  };
  const openRecord = (collection, title, fields, defaults, record) =>
    setEditor({
      collection,
      title,
      fields,
      values: record || { ...defaults, project: project.id },
      id: record?.id,
    });
  const heading = (kicker, title, description, action) => (
    <Title kicker={kicker} title={title} description={description}>
      {action}
    </Title>
  );
  let content;
  if (module === "Timeline") {
    const rows = scope(state.milestones);
    const fields = [
      ...commonFields,
      { key: "phase", label: "Delivery phase" },
      { key: "due", label: "Committed / target date", type: "date" },
      {
        key: "status",
        label: "State",
        options: ["Planned", "In progress", "At risk"],
      },
    ];
    const dated = rows.filter((m) => m.due);
    const min = dated.length
      ? Math.min(...dated.map((m) => Date.parse(m.due)))
      : Date.parse(SCENARIO_DATE);
    const max = Math.max(
      min + 86400000 * 14,
      ...dated.map((m) => Date.parse(m.due)),
    );
    content = (
      <>
        {heading(
          "DELIVERY PLAN",
          "Milestones & timeline",
          "A checkpoint is complete only when its linked work and approval are complete.",
          !portal && (
            <Button
              variant="primary"
              onClick={() =>
                openRecord("milestones", "Add milestone", fields, {
                  title: "",
                  owner: project.owner,
                  visibility: "Internal",
                  phase: "Delivery",
                  due: "",
                  status: "Planned",
                  issues: [],
                })
              }
            >
              <Plus size={15} />
              Add milestone
            </Button>
          ),
        )}
        <div className="timeline-surface">
          <div className="timeline-axis">
            <span>Delivery checkpoint</span>
            <span>{shortDate(new Date(min).toISOString().slice(0, 10))}</span>
            <span>{shortDate(new Date(max).toISOString().slice(0, 10))}</span>
          </div>
          {rows.map((m) => (
            <div className="timeline-row" key={m.id}>
              <div className="timeline-label">
                <Diamond size={16} />
                <span>
                  <b>{m.title}</b>
                  <small>
                    {m.phase} · {shortDate(m.due)}
                  </small>
                </span>
              </div>
              <div className="timeline-track">
                {m.due ? (
                  <span
                    style={{
                      left: `${Math.min(97, ((Date.parse(m.due) - min) / (max - min)) * 97)}%`,
                    }}
                    className={`timeline-pin ${m.status === "Complete" ? "complete" : ""}`}
                    title={`${m.title} · ${m.due}`}
                  >
                    <Diamond size={14} />
                  </span>
                ) : (
                  <span className="timeline-unscheduled">Unscheduled</span>
                )}
              </div>
              <Badge>{m.status}</Badge>
              {!portal && (
                <Button
                  variant="ghost"
                  disabled={m.status === "Complete"}
                  onClick={() =>
                    openRecord("milestones", "Edit milestone", fields, {}, m)
                  }
                >
                  Edit
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="module-note">
          <CalendarDays size={16} />
          Dates are entered commitments or targets. This is not an automatic
          scheduling or critical-path engine.
        </div>
        <div className="milestone-gates">
          {rows.map((m) => (
            <Panel
              key={m.id}
              title={m.title}
              subtitle={`${shortDate(m.due)} · ${m.visibility}`}
              action={<Avatar id={m.owner} />}
            >
              <div className="gate-body">
                <span className="section-kicker">COMPLETION GATE</span>
                {m.issues
                  .filter(
                    (id) =>
                      !portal ||
                      state.issues.some(
                        (i) => i.id === id && i.visibility === "Shared",
                      ),
                  )
                  .map((id) => (
                    <button
                      className="inline-link"
                      key={id}
                      onClick={() => props.setModal({ type: "issue", id })}
                    >
                      {id} ·{" "}
                      {state.issues.find((i) => i.id === id)?.title ||
                        "Unavailable"}
                      <Badge>
                        {state.issues.find((i) => i.id === id)?.status ||
                          "Missing"}
                      </Badge>
                    </button>
                  ))}
                {!portal && m.status !== "Complete" && (
                  <Field label={`Link work to ${m.title}`}>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          setState((s) => ({
                            ...s,
                            milestones: s.milestones.map((item) =>
                              item.id === m.id
                                ? {
                                    ...item,
                                    issues: [...item.issues, e.target.value],
                                  }
                                : item,
                            ),
                          }));
                      }}
                    >
                      <option value="">Select a work item…</option>
                      {state.issues
                        .filter(
                          (i) =>
                            i.project === m.project && !m.issues.includes(i.id),
                        )
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.id} · {i.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                {m.approval && (
                  <small>
                    Approval:{" "}
                    {state.approvals.find((a) => a.id === m.approval)?.title ||
                      "Unavailable"}{" "}
                    · {state.approvals.find((a) => a.id === m.approval)?.status}
                  </small>
                )}
                <p
                  className={
                    milestoneGate(state, m) ? "gate-blocked" : "gate-ready"
                  }
                >
                  {portal
                    ? m.status === "Complete"
                      ? "Checkpoint completed"
                      : "Your delivery team is validating this checkpoint"
                    : milestoneGate(state, m) ||
                      "Linked completion gates satisfied"}
                </p>
                {!portal && (
                  <Button
                    disabled={m.status === "Complete"}
                    onClick={() =>
                      run(
                        (s) => finishMilestone(s, m.id),
                        "Milestone completed locally.",
                      )
                    }
                  >
                    {m.status === "Complete" ? (
                      <Check size={14} />
                    ) : (
                      <CheckCheck size={14} />
                    )}
                    Mark complete
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
        {!rows.length && (
          <Empty
            title="No milestones yet"
            text="Add the checkpoints your team and customer will use to track delivery."
          />
        )}
      </>
    );
  } else if (module === "Risks") {
    const fields = [
      ...commonFields,
      { key: "impact", label: "Impact", options: ["Low", "Medium", "High"] },
      { key: "due", label: "Follow-up date", type: "date" },
      {
        key: "mitigation",
        label: "Mitigation & next action",
        type: "textarea",
        required: true,
      },
    ];
    const rows = scope(state.risks).filter(
      (r) => filter === "All" || r.status === filter,
    );
    content = (
      <>
        {heading(
          "DELIVERY GOVERNANCE",
          "Risk & dependency register",
          "An explicit owner, a mitigation and a next review date for every risk.",
          !portal && (
            <Button
              variant="primary"
              onClick={() =>
                openRecord("risks", "Record a risk", fields, {
                  title: "",
                  owner: project.owner,
                  visibility: "Internal",
                  impact: "Medium",
                  due: "",
                  mitigation: "",
                  status: "Open",
                })
              }
            >
              <Plus size={15} />
              Record risk
            </Button>
          ),
        )}
        <Segments
          items={["All", "Open", "Resolved"].map((f) => [
            f,
            filter === f,
            () => setFilter(f),
          ])}
        />
        <div className="risk-register">
          {rows.map((r) => (
            <article className="risk-record" key={r.id}>
              <header>
                <span className={`impact ${r.impact.toLowerCase()}`}>
                  {r.impact} impact
                </span>
                <Visibility value={r.visibility} />
                <Badge>{r.status}</Badge>
              </header>
              <h2>{r.title}</h2>
              <p>{r.mitigation}</p>
              <footer>
                <Avatar id={r.owner} label />
                <span>Follow up {shortDate(r.due)}</span>
                {!portal && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        openRecord("risks", "Edit risk", fields, {}, r)
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() =>
                        mutate(
                          (s) =>
                            recordEvent(
                              {
                                ...s,
                                risks: s.risks.map((item) =>
                                  item.id === r.id
                                    ? {
                                        ...item,
                                        status:
                                          r.status === "Open"
                                            ? "Resolved"
                                            : "Open",
                                      }
                                    : item,
                                ),
                              },
                              "risk.updated",
                              r.project,
                              r.title,
                            ),
                          "Risk state updated.",
                        )
                      }
                    >
                      {r.status === "Open" ? "Resolve" : "Reopen"}
                    </Button>
                  </>
                )}
              </footer>
            </article>
          ))}
        </div>
        {!rows.length && (
          <Empty
            title="No risks in this view"
            text="Risks remain visible in the resolved register after mitigation."
          />
        )}
      </>
    );
  } else if (module === "Meetings") {
    const fields = [
      ...commonFields,
      { key: "date", label: "Meeting date", type: "date", required: true },
      {
        key: "summary",
        label: "Meeting summary",
        type: "textarea",
        required: true,
      },
      { key: "decision", label: "Decision & rationale", type: "textarea" },
      { key: "action", label: "Follow-up action" },
    ];
    content = (
      <>
        {heading(
          "COLLABORATIVE KNOWLEDGE",
          "Meetings & decisions",
          "Keep the conversation, decision and accountable follow-up connected.",
          !portal && (
            <Button
              variant="primary"
              onClick={() =>
                openRecord("meetings", "Record meeting", fields, {
                  title: "",
                  owner: project.owner,
                  visibility: "Internal",
                  date: SCENARIO_DATE,
                  summary: "",
                  decision: "",
                  action: "",
                  issue: null,
                })
              }
            >
              <Plus size={15} />
              Record meeting
            </Button>
          ),
        )}
        <div className="meeting-grid">
          {scope(state.meetings).map((m) => (
            <article className="meeting-record" key={m.id}>
              <div className="meeting-date">
                <CalendarDays size={18} />
                {shortDate(m.date)}
                <Visibility value={m.visibility} />
              </div>
              <h2>{m.title}</h2>
              <p>{m.summary}</p>
              {m.decision && (
                <div className="decision-block">
                  <span className="section-kicker">DECISION RECORDED</span>
                  <p>{m.decision}</p>
                </div>
              )}
              {m.action && (
                <div className="meeting-action">
                  <Flag size={17} />
                  <span>
                    <small>ACCOUNTABLE FOLLOW-UP</small>
                    <b>{m.action}</b>
                  </span>
                  <Avatar id={m.owner} />
                </div>
              )}
              <footer>
                {!portal && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      openRecord("meetings", "Edit meeting", fields, {}, m)
                    }
                  >
                    Edit notes
                  </Button>
                )}
                {m.issue ? (
                  <button
                    className="inline-link"
                    onClick={() =>
                      props.setModal({ type: "issue", id: m.issue })
                    }
                  >
                    Linked work: {m.issue}
                    <Link2 size={14} />
                  </button>
                ) : (
                  !portal &&
                  m.action && (
                    <Button
                      onClick={() =>
                        run(
                          (s) => createMeetingAction(s, m.id),
                          "Meeting action linked to one new issue.",
                        )
                      }
                    >
                      Create work item <ArrowRight size={14} />
                    </Button>
                  )
                )}
              </footer>
            </article>
          ))}
        </div>
        {!scope(state.meetings).length && (
          <Empty
            title="The project memory starts here"
            text="Record a meeting, its decisions and what happens next."
          />
        )}
      </>
    );
  } else if (module === "UAT") {
    const rows = scope(state.tests),
      frozen = state.signoffs.some((s) => s.project === project.id);
    const fields = [
      ...commonFields,
      {
        key: "criteria",
        label: "Acceptance criteria",
        type: "textarea",
        required: true,
      },
    ];
    content = (
      <>
        {heading(
          "DELIVERABLE ACCEPTANCE",
          "Acceptance & sign-off",
          "Acceptance has an explicit baseline. Failing tests remain open until they pass.",
          !portal && (
            <Button
              disabled={frozen}
              variant="primary"
              onClick={() =>
                openRecord("tests", "Add acceptance test", fields, {
                  title: "",
                  criteria: "",
                  owner: project.owner,
                  visibility: "Shared",
                  status: "Not run",
                  defect: null,
                })
              }
            >
              <Plus size={15} />
              Add test
            </Button>
          ),
        )}
        <div className="metrics-band three">
          <Metric
            label="Test cases"
            value={rows.length}
            note="In this acceptance package"
          />
          <Metric
            label="Passed"
            value={rows.filter((t) => t.status === "Passed").length}
            note="Validated against criteria"
          />
          <Metric
            label="Failed"
            value={rows.filter((t) => t.status === "Failed").length}
            note="Requires correction"
            accent
          />
        </div>
        <Panel
          title="Acceptance register"
          subtitle={
            frozen
              ? "Signed-off local baseline. Cases are frozen."
              : "Select a result only after reviewing the actual deliverable."
          }
          action={<Badge>{frozen ? "Approved" : "Review pending"}</Badge>}
        >
          <div className="test-register">
            {rows.map((t) => (
              <div className="test-row" key={t.id}>
                <span
                  className={`test-symbol ${t.status.toLowerCase().replace(" ", "-")}`}
                >
                  {t.status === "Passed" ? (
                    <Check size={18} />
                  ) : (
                    <FileCheck2 size={18} />
                  )}
                </span>
                <div>
                  <b>{t.title}</b>
                  <p>{t.criteria}</p>
                  {t.defect && !portal && (
                    <button
                      className="inline-link"
                      onClick={() =>
                        props.setModal({ type: "issue", id: t.defect })
                      }
                    >
                      Defect {t.defect}
                      <Link2 size={12} />
                    </button>
                  )}
                </div>
                <Avatar id={t.owner} />
                <select
                  aria-label={`Result for ${t.title}`}
                  disabled={frozen}
                  value={t.status}
                  onChange={(e) =>
                    mutate(
                      (s) =>
                        recordEvent(
                          {
                            ...s,
                            tests: s.tests.map((item) =>
                              item.id === t.id
                                ? { ...item, status: e.target.value }
                                : item,
                            ),
                          },
                          "uat.result",
                          t.project,
                          `${t.title}: ${e.target.value}`,
                        ),
                      "Test result recorded locally.",
                    )
                  }
                >
                  <option>Not run</option>
                  <option>Passed</option>
                  <option>Failed</option>
                </select>
                {!portal && t.status === "Failed" && !t.defect && (
                  <Button
                    onClick={() =>
                      run(
                        (s) => defectFromTest(s, t.id),
                        "One linked defect created.",
                      )
                    }
                  >
                    Create defect
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!rows.length && (
            <Empty
              title="Define acceptance before testing"
              text="Add the business outcome and evidence required for each test."
            />
          )}
          <div className="acceptance-footer">
            <span>
              <ShieldCheck size={18} />
              {frozen
                ? "Acceptance snapshot retained."
                : "All test cases must pass to sign off."}
            </span>
            {!portal && (
              <Button
                disabled={frozen}
                variant="primary"
                onClick={() =>
                  run(
                    (s) => signOff(s, project.id),
                    "Local acceptance snapshot signed off. No customer signature or email sent.",
                  )
                }
              >
                {frozen ? "Signed off" : "Sign off local baseline"}
              </Button>
            )}
          </div>
        </Panel>
        <div className="module-note">
          Local review workflow, not an authenticated customer signature. New
          revisions require a new acceptance package in the production service.
        </div>
      </>
    );
  } else if (module === "Handoffs") {
    content = (
      <>
        {heading(
          "SALES → DELIVERY",
          "Sales-to-delivery handoffs",
          "A reviewable handoff before a customer engagement starts. HubSpot is not connected.",
          <Badge tone="neutral">Manual scenario records</Badge>,
        )}
        <div className="handoff-steps">
          {[
            "Closed-won context",
            "Scope & owner review",
            "Template preview",
            "Create engagement",
          ].map((step, index) => (
            <div key={step}>
              <span>0{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
        <div className="handoff-grid">
          {state.handoffs.map((h) => (
            <article className="handoff-record" key={h.id}>
              <header>
                <span className="section-kicker">
                  {state.customers.find((c) => c.id === h.customer)?.name}
                </span>
                <Badge tone="green">{h.stage}</Badge>
              </header>
              <h2>{h.name}</h2>
              <p>{h.scope}</p>
              <dl>
                <div>
                  <dt>Customer sponsor</dt>
                  <dd>{h.contact}</dd>
                </div>
                <div>
                  <dt>Service pattern</dt>
                  <dd>
                    {TEMPLATES.find((t) => t.id === h.template)?.name} · v1
                  </dd>
                </div>
                <div>
                  <dt>Delivery owner</dt>
                  <dd>
                    <Avatar id={h.owner} label />
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{h.source} · Not synchronized</dd>
                </div>
              </dl>
              <footer>
                {h.project ? (
                  <Button onClick={() => nav("Project", h.project)}>
                    Open engagement <ArrowUpRight size={14} />
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() =>
                      setEditor({ handoff: h, values: { key: "", start: "" } })
                    }
                  >
                    Review & create engagement <ArrowRight size={14} />
                  </Button>
                )}
                <small>No invitation or email is sent.</small>
              </footer>
            </article>
          ))}
        </div>
      </>
    );
  } else if (module === "Resources") {
    const week = "2026-09-28";
    const fields = [
      {
        key: "project",
        label: "Project",
        options: state.projects.map((p) => [p.id, p.name]),
      },
      {
        key: "person",
        label: "Team member",
        options: PEOPLE.map((p) => [p.id, p.name]),
      },
      {
        key: "hours",
        label: "Hours this week",
        type: "number",
        min: 0,
        max: 80,
        required: true,
      },
      { key: "week", label: "Week beginning", type: "date", required: true },
    ];
    content = (
      <>
        {heading(
          "TEAM & CAPACITY",
          "Team capacity",
          "Compare planned allocation with a stated 40-hour weekly capacity.",
          <Button
            variant="primary"
            onClick={() =>
              openRecord("allocations", "Allocate capacity", fields, {
                project: project.id,
                person: "rk",
                hours: 8,
                week,
              })
            }
          >
            <Plus size={15} />
            Allocate capacity
          </Button>,
        )}
        <div className="resource-period">
          <CalendarDays size={17} />
          28 Sep – 04 Oct 2026 <Badge tone="neutral">Scenario week</Badge>
          <span>40h / person · Leave not modelled</span>
        </div>
        <div className="capacity-grid">
          {PEOPLE.map((person) => {
            const rows = state.allocations.filter(
                (a) => a.person === person.id && a.week === week,
              ),
              total = rows.reduce((n, a) => n + a.hours, 0);
            return (
              <article className="capacity-card" key={person.id}>
                <header>
                  <Avatar id={person.id} />
                  <div>
                    <h2>{person.name}</h2>
                    <small>
                      {person.id === "ar"
                        ? "Delivery & strategy"
                        : person.id === "sp"
                          ? "Data engineering"
                          : person.id === "mn"
                            ? "Analytics & validation"
                            : "Technical delivery"}
                    </small>
                  </div>
                </header>
                <div className="capacity-numbers">
                  <strong>
                    {hours(total)}
                    <span>/ 40h</span>
                  </strong>
                  <Badge tone={total > 40 ? "red" : "green"}>
                    {total > 40
                      ? "Overallocated"
                      : `${hours(40 - total)} available`}
                  </Badge>
                </div>
                <div className="capacity-bar">
                  <span
                    style={{ width: `${Math.min(100, (total / 40) * 100)}%` }}
                    className={total > 40 ? "over" : ""}
                  />
                </div>
                <div className="allocation-list">
                  {rows.map((a) => (
                    <button
                      key={a.id}
                      onClick={() =>
                        openRecord(
                          "allocations",
                          "Edit allocation",
                          fields,
                          {},
                          a,
                        )
                      }
                    >
                      <span className="project-dot" />
                      <span>
                        {state.projects.find((p) => p.id === a.project)?.name}
                      </span>
                      <b>{hours(a.hours)}</b>
                      <SlidersHorizontal size={13} />
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </>
    );
  } else if (module === "Time") {
    const rows = state.timeEntries.filter(
      (t) => filter === "All" || t.status === filter,
    );
    const fields = [
      {
        key: "project",
        label: "Project",
        options: state.projects.map((p) => [p.id, p.name]),
      },
      {
        key: "person",
        label: "Team member",
        options: PEOPLE.map((p) => [p.id, p.name]),
      },
      { key: "date", label: "Work date", type: "date", required: true },
      {
        key: "hours",
        label: "Hours",
        type: "number",
        min: 0.25,
        max: 24,
        step: 0.25,
        required: true,
      },
      {
        key: "note",
        label: "Work description",
        type: "textarea",
        required: true,
      },
      {
        key: "billing",
        label: "Time category",
        options: ["Billable", "Non-billable"],
      },
    ];
    content = (
      <>
        {heading(
          "EFFORT & ACCOUNTABILITY",
          "Time & effort",
          "Draft → submitted → approved. Approved entries cannot be silently edited.",
          <Button
            variant="primary"
            onClick={() =>
              openRecord("timeEntries", "Log time", fields, {
                project: project.id,
                person: "ar",
                date: SCENARIO_DATE,
                hours: 1,
                note: "",
                billing: "Billable",
                status: "Draft",
              })
            }
          >
            <Plus size={15} />
            Log time
          </Button>,
        )}
        <div className="metrics-band three">
          <Metric
            label="Recorded effort"
            value={hours(state.timeEntries.reduce((n, t) => n + t.hours, 0))}
            note="All local entries"
          />
          <Metric
            label="Awaiting review"
            value={hours(
              state.timeEntries
                .filter((t) => t.status === "Submitted")
                .reduce((n, t) => n + t.hours, 0),
            )}
            note="Submitted entries"
          />
          <Metric
            label="Approved billable"
            value={hours(
              state.timeEntries
                .filter((t) => t.status === "Approved" && t.billable)
                .reduce((n, t) => n + t.hours, 0),
            )}
            note="Approved ledger consumption"
          />
        </div>
        <Segments
          items={["All", "Draft", "Submitted", "Approved"].map((f) => [
            f,
            filter === f,
            () => setFilter(f),
          ])}
        />
        <Panel
          title="Effort ledger"
          subtitle="Local review authority only. Production role separation is not connected."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Work & project</th>
                  <th>Person</th>
                  <th>Date</th>
                  <th>Effort</th>
                  <th>Category</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <b>{t.note}</b>
                      <small className="table-subline">
                        {state.projects.find((p) => p.id === t.project)?.name}
                      </small>
                    </td>
                    <td>
                      <Avatar id={t.person} label size="small" />
                    </td>
                    <td>{shortDate(t.date)}</td>
                    <td>
                      <b>{hours(t.hours)}</b>
                    </td>
                    <td>{t.billable ? "Billable" : "Non-billable"}</td>
                    <td>
                      <div className="ledger-actions">
                        <Badge>{t.status}</Badge>
                        {t.status === "Draft" && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              run(
                                (s) => transitionTime(s, t.id, "Submitted"),
                                "Time submitted for local review.",
                              )
                            }
                          >
                            Submit
                          </Button>
                        )}
                        {t.status === "Submitted" && (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                run(
                                  (s) => transitionTime(s, t.id, "Draft"),
                                  "Returned to draft.",
                                )
                              }
                            >
                              Return
                            </Button>
                            <Button
                              onClick={() =>
                                run(
                                  (s) => transitionTime(s, t.id, "Approved"),
                                  "Time approved in the local ledger.",
                                )
                              }
                            >
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty
              title="No time in this view"
              text="Log an entry to capture the work behind a project."
            />
          )}
        </Panel>
      </>
    );
  } else if (module === "Finance") {
    const invoiceFields = [
      {
        key: "project",
        label: "Engagement",
        options: state.projects.map((p) => [p.id, p.name]),
      },
      {
        key: "title",
        label: "Invoice reference / description",
        required: true,
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        min: 0,
        required: true,
      },
      {
        key: "currency",
        label: "Currency",
        options: ["USD", "EUR", "GBP", "INR"],
      },
      { key: "due", label: "Due date", type: "date", required: true },
      {
        key: "status",
        label: "Recorded status",
        options: ["Draft", "Awaiting payment", "Paid"],
      },
    ];
    content = (
      <>
        {heading(
          "COMMERCIAL CONTEXT",
          "Commercials & billing",
          "A manual billing-readiness view. Zoho Books remains the accounting source of truth.",
          <Button
            variant="primary"
            onClick={() =>
              openRecord(
                "invoices",
                "Add manual invoice reference",
                invoiceFields,
                {
                  project: project.id,
                  title: "",
                  amount: 0,
                  currency: "USD",
                  due: "",
                  status: "Draft",
                  source: "Manual demo",
                },
              )
            }
          >
            <Plus size={15} />
            Add reference
          </Button>,
        )}
        <div className="finance-currencies">
          {[...new Set(state.invoices.map((i) => i.currency))].map(
            (currency) => (
              <Metric
                key={currency}
                label={`${currency} awaiting payment`}
                value={money(
                  state.invoices
                    .filter(
                      (i) =>
                        i.currency === currency &&
                        i.status === "Awaiting payment",
                    )
                    .reduce((n, i) => n + i.amount, 0),
                  currency,
                )}
                note="Currency totals remain separate"
              />
            ),
          )}
          <div className="finance-source">
            <Link2 size={22} />
            <b>Zoho Books not connected</b>
            <small>No invoice is created, sent or collected here.</small>
          </div>
        </div>
        <Panel
          title="Engagement economics"
          subtitle="Fixed-fee context and approved effort. No fabricated margin forecast."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Agreed fee</th>
                  <th>Effort budget</th>
                  <th>Approved effort</th>
                  <th>Billing readiness</th>
                </tr>
              </thead>
              <tbody>
                {state.projects.map((p) => {
                  const c = state.commercials.find((c) => c.project === p.id),
                    effort = state.timeEntries
                      .filter(
                        (t) => t.project === p.id && t.status === "Approved",
                      )
                      .reduce((n, t) => n + t.hours, 0),
                    open = state.milestones.filter(
                      (m) => m.project === p.id && m.status !== "Complete",
                    ).length;
                  return (
                    <tr key={p.id}>
                      <td>
                        <button
                          className="inline-link"
                          onClick={() => nav("Project", p.id)}
                        >
                          {p.name}
                          <ArrowUpRight size={13} />
                        </button>
                        <small className="table-subline">
                          {client(state, p)}
                        </small>
                      </td>
                      <td>{c ? money(c.fee, c.currency) : "Not configured"}</td>
                      <td>
                        {c?.budgetHours
                          ? hours(c.budgetHours)
                          : "Not configured"}
                      </td>
                      <td>{hours(effort)}</td>
                      <td>
                        <Badge>
                          {open
                            ? `${open} checkpoints open`
                            : "Review deliverable evidence"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Invoice references"
          subtitle="Manual status entries, not a live synchronized ledger."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Engagement</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {state.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.title}</b>
                      <small className="table-subline">{i.id}</small>
                    </td>
                    <td>
                      {state.projects.find((p) => p.id === i.project)?.name}
                    </td>
                    <td>{money(i.amount, i.currency)}</td>
                    <td>{shortDate(i.due)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          openRecord(
                            "invoices",
                            "Edit manual invoice reference",
                            invoiceFields,
                            {},
                            i,
                          )
                        }
                      >
                        <Badge>{i.status}</Badge>
                        <SlidersHorizontal size={13} />
                      </Button>
                    </td>
                    <td>
                      <small>{i.source}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </>
    );
  } else if (module === "Templates") {
    content = (
      <>
        {heading(
          "REPEATABLE DELIVERY",
          "Delivery templates",
          "Versioned starter patterns that create real work and milestones, not decorative previews.",
        )}
        <div className="template-banner">
          <Layers size={28} />
          <div>
            <b>The pattern is a starting point. The SOW is the scope.</b>
            <p>
              Created tasks default to Internal and remain undated. Review the
              template against contractual scope before sharing.
            </p>
          </div>
          <span>STARTER LIBRARY / V1</span>
        </div>
        <div className="template-catalog">
          {TEMPLATES.map((t, index) => (
            <article className={`template-record ${t.color}`} key={t.id}>
              <header>
                <span>0{index + 1}</span>
                <Badge tone="neutral">Version 1</Badge>
              </header>
              <small className="section-kicker">{t.discipline}</small>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="template-phases">
                {t.phases.map((p) => (
                  <span key={p}>{p}</span>
                ))}
              </div>
              <footer>
                <span>
                  <b>{t.tasks.length} starter tasks</b>
                  <small>{t.duration}</small>
                </span>
                <Button
                  onClick={() =>
                    setEditor({
                      template: t,
                      values: {
                        name: "",
                        key: "",
                        customer: state.customers[0].id,
                        owner: "rk",
                        start: "",
                      },
                    })
                  }
                >
                  Use template <ArrowUpRight size={14} />
                </Button>
              </footer>
            </article>
          ))}
        </div>
      </>
    );
  } else if (module === "Reports") {
    const total = state.issues.length,
      done = state.issues.filter((i) => i.status === "Done").length;
    content = (
      <>
        {heading(
          "CURRENT-STATE ANALYTICS",
          "Delivery performance",
          "A transparent snapshot of the current records. Historical velocity requires real event history.",
        )}
        <div className="metrics-band">
          <Metric label="Work items" value={total} note="Across all projects" />
          <Metric label="Completed" value={done} note="Current Done status" />
          <Metric
            label="Open risks"
            value={state.risks.filter((r) => r.status === "Open").length}
            note="Explicit risk register"
          />
          <Metric
            label="Local activity"
            value={state.audit.length}
            note="Events since this build"
          />
        </div>
        <div className="report-grid">
          <Panel
            title="Work by status"
            subtitle="Current snapshot, not a historical burndown."
          >
            <div className="status-report">
              {state.workflow.map((status) => {
                const count = state.issues.filter(
                  (i) => i.status === status,
                ).length;
                return (
                  <div key={status}>
                    <span>{status}</span>
                    <div>
                      <span
                        style={{
                          width: `${total ? (100 * count) / total : 0}%`,
                        }}
                      />
                    </div>
                    <b>{count}</b>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel
            title="Engagement completion"
            subtitle="Unweighted issue count; scope size is shown."
          >
            <div className="completion-report">
              {state.projects.map((p) => (
                <button key={p.id} onClick={() => nav("Project", p.id)}>
                  <span>
                    {p.name}
                    <small>
                      {state.issues.filter((i) => i.project === p.id).length}{" "}
                      work items
                    </small>
                  </span>
                  <Progress value={progress(state.issues, p.id)} />
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div className="report-limits">
          <Activity size={22} />
          <div>
            <h2>No invented historical curves.</h2>
            <p>
              Cycle time, sprint burndown and forecast accuracy will become
              available once durable transitions and daily snapshots exist.
              Today's report only describes records this workspace actually
              holds.
            </p>
          </div>
        </div>
      </>
    );
  } else if (module === "Activity") {
    const rows = scope(
      state.audit.map((a) => ({ ...a, visibility: "Internal" })),
    );
    content = (
      <>
        {heading(
          "PROJECT MEMORY",
          "Activity & audit trail",
          "Local changes with timestamps and their source event. Not a tamper-proof production audit.",
        )}
        <div className="audit-stream">
          {rows.map((a) => (
            <div key={a.id}>
              <span className="audit-symbol">
                <Activity size={15} />
              </span>
              <div>
                <b>{a.title}</b>
                <small>
                  {a.event} · {new Date(a.at).toLocaleString()} · Local
                  administrator
                </small>
              </div>
            </div>
          ))}
        </div>
        {!rows.length && (
          <Empty
            title="Changes leave a trail"
            text="Milestone, risk, meeting, UAT and time operations appear here as you use the workspace."
          />
        )}
      </>
    );
  } else if (module === "Automations") {
    content = (
      <>
        {heading(
          "WORKFLOW ORCHESTRATION",
          "Rules, with boundaries.",
          "Local request assignment rules. External triggers and email actions are not enabled.",
        )}
        <div className="automation-flow">
          <div>
            <span>WHEN</span>
            <h2>A request is created</h2>
            <small>Local request submission</small>
          </div>
          <ChevronRight />
          <div>
            <span>THEN</span>
            <h2>Assign the delivery lead</h2>
            <small>Owner from the linked project</small>
          </div>
          <ChevronRight />
          <div>
            <span>RECORD</span>
            <h2>Keep an activity event</h2>
            <small>No third-party side effect</small>
          </div>
        </div>
        <Panel
          title="Local automation rules"
          subtitle="Only the displayed action is implemented."
        >
          {state.rules.map((rule) => (
            <div className="rule-row" key={rule.id}>
              <Play size={18} />
              <div>
                <b>{rule.name}</b>
                <small>
                  {rule.event} → {rule.action}
                </small>
              </div>
              <Badge>{rule.enabled ? "Enabled" : "Disabled"}</Badge>
              <Button
                onClick={() =>
                  mutate(
                    (s) => ({
                      ...s,
                      rules: s.rules.map((r) =>
                        r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
                      ),
                    }),
                    "Local rule configuration saved.",
                  )
                }
              >
                {rule.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
        </Panel>
        <div className="module-note">
          HubSpot closed-won, Resend notifications and recurring jobs require
          authenticated server-side workers. They are not simulated as live
          integrations.
        </div>
      </>
    );
  }
  return (
    <div className="delivery-module">
      {content}
      {editor && !editor.template && !editor.handoff && (
        <RecordEditor
          title={editor.title}
          fields={editor.fields}
          data={editor.values}
          onClose={close}
          onSave={(values) => {
            if (editor.collection === "timeEntries") {
              if (!(values.hours > 0 && values.hours <= 24))
                throw new Error("Hours must be between 0 and 24.");
              values = { ...values, billable: values.billing === "Billable" };
            }
            if (
              editor.collection === "allocations" &&
              !(values.hours >= 0 && values.hours <= 80)
            )
              throw new Error("Allocation must be between 0 and 80 hours.");
            saveRecord(editor.collection, values, editor.id);
          }}
        />
      )}
      {editor?.template && (
        <RecordEditor
          title={`Create from ${editor.template.name}`}
          data={editor.values}
          fields={[
            { key: "name", label: "Engagement name", required: true },
            { key: "key", label: "Unique project key", required: true },
            {
              key: "customer",
              label: "Customer",
              options: state.customers.map((c) => [c.id, c.name]),
            },
            {
              key: "owner",
              label: "Delivery lead",
              options: PEOPLE.map((p) => [p.id, p.name]),
            },
            { key: "start", label: "Kickoff date", type: "date" },
          ]}
          onClose={close}
          onSave={(values) => {
            const result = instantiateTemplate(
              state,
              editor.template.id,
              values,
            );
            setState(result.state);
            close();
            nav("Project", result.project.id, "Timeline");
            setNotice(
              "Template v1 created internal work and undated milestones. Review against the SOW.",
            );
          }}
        />
      )}
      {editor?.handoff && (
        <RecordEditor
          title={`Create: ${editor.handoff.name}`}
          data={editor.values}
          fields={[
            { key: "key", label: "Unique project key", required: true },
            { key: "start", label: "Kickoff date", type: "date" },
          ]}
          onClose={close}
          onSave={(values) => {
            const result = createHandoffProject(
              state,
              editor.handoff.id,
              values,
            );
            setState(result.state);
            close();
            nav("Project", result.project.id);
            setNotice(
              "Handoff linked to one templated engagement. Review scope before sharing.",
            );
          }}
        />
      )}
    </div>
  );
}

export function CommandSearch({ state, nav, onClose }) {
  const [query, setQuery] = useState("");
  const pages = [
    "Home",
    "Handoffs",
    "Projects",
    "Customers",
    "My work",
    "Requests",
    "Documents",
    "Resources",
    "Time",
    "Finance",
    "Reports",
    "Templates",
    "Automations",
    "Settings",
  ];
  const q = query.toLowerCase();
  return (
    <Modal title="Find your next workspace" onClose={onClose}>
      <div className="command-search">
        <label>
          <Search size={19} />
          <input
            autoFocus
            aria-label="Search workspaces and engagements"
            placeholder="Search workspaces or engagements…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="section-kicker">WORKSPACES</span>
        {pages
          .filter((p) => p.toLowerCase().includes(q))
          .map((p) => (
            <button
              key={p}
              onClick={() => {
                nav(p);
                onClose();
              }}
            >
              <Layers size={16} />
              {p}
              <ArrowRight size={14} />
            </button>
          ))}
        <span className="section-kicker">ENGAGEMENTS</span>
        {state.projects
          .filter((p) =>
            `${p.name} ${client(state, p)}`.toLowerCase().includes(q),
          )
          .map((p) => (
            <button
              key={p.id}
              onClick={() => {
                nav("Project", p.id);
                onClose();
              }}
            >
              <span className={`monogram small ${p.color}`}>
                {client(state, p).slice(0, 1)}
              </span>
              {p.name}
              <small>{client(state, p)}</small>
            </button>
          ))}
      </div>
    </Modal>
  );
}

export function ClientHome({ state, project, customer, nav, setModal }) {
  const approvals = state.approvals.filter(
    (a) => a.project === project.id && a.status === "Pending",
  );
  const clarifications = state.requests.filter(
    (r) => r.project === project.id && r.status === "Clarification needed",
  );
  const cases = state.tests.filter(
    (t) =>
      t.project === project.id &&
      t.visibility === "Shared" &&
      t.status !== "Passed",
  );
  const milestones = state.milestones.filter(
    (m) => m.project === project.id && m.visibility === "Shared",
  );
  const updates = state.updates.filter(
    (u) => u.project === project.id && u.visibility === "Shared",
  );
  const shared = state.issues.filter(
    (i) => i.project === project.id && i.visibility === "Shared",
  );
  return (
    <div className="client-home">
      <div className="client-identity">
        <span className="monogram">{customer.name[0]}</span>
        <span>
          {customer.name}
          <small>Seven Billion · Delivery partner</small>
        </span>
        <Badge tone="neutral">Customer preview</Badge>
      </div>
      <Title
        kicker="YOUR SHARED WORKSPACE"
        title={`Welcome, ${customer.contact}.`}
        description={`Your shared workspace for ${project.name}. Review decisions, follow the plan and keep delivery moving.`}
      >
        <Button
          variant="primary"
          onClick={() => setModal({ type: "createRequest" })}
        >
          <Plus size={15} />
          New request
        </Button>
      </Title>
      <div className="client-home-grid">
        <div>
          <Panel
            title="Your next actions"
            subtitle="Review the evidence, respond to the question, or validate the outcome."
            action={
              <Badge tone="neutral">
                {approvals.length +
                  clarifications.length +
                  (cases.length ? 1 : 0)}{" "}
                actions
              </Badge>
            }
          >
            {approvals.map((a) => (
              <button
                key={a.id}
                className="client-action"
                onClick={() => setModal({ type: "approval", id: a.id })}
              >
                <FileCheck2 size={21} />
                <span>
                  <small>APPROVAL · VERSION {a.version}</small>
                  <b>{a.title}</b>
                  <p>{a.summary}</p>
                </span>
                <span className="client-action-cta">
                  Review <ArrowRight size={14} />
                </span>
              </button>
            ))}
            {clarifications.map((r) => (
              <button
                key={r.id}
                className="client-action"
                onClick={() => setModal({ type: "request", id: r.id })}
              >
                <Flag size={21} />
                <span>
                  <small>CLARIFICATION REQUESTED</small>
                  <b>{r.title}</b>
                  <p>{r.description}</p>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
            {cases.length > 0 && (
              <button
                className="client-action"
                onClick={() => nav("Project", project.id, "UAT")}
              >
                <ShieldCheck size={21} />
                <span>
                  <small>ACCEPTANCE REVIEW</small>
                  <b>{cases.length} shared test cases need review</b>
                  <p>
                    Validate the deliverable against its agreed acceptance
                    criteria.
                  </p>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
            {!approvals.length && !clarifications.length && !cases.length && (
              <Empty
                title="You're up to date"
                text="Your next decision or review will appear here when the team publishes it."
              />
            )}
          </Panel>
          <Panel
            title="The shared delivery plan"
            subtitle="Visible checkpoints, their target dates and current state."
            action={
              <button
                className="inline-link"
                onClick={() => nav("Project", project.id, "Timeline")}
              >
                View plan <ArrowUpRight size={14} />
              </button>
            }
          >
            <div className="milestone-list">
              {milestones.map((m) => (
                <button
                  className="milestone-line"
                  key={m.id}
                  onClick={() => nav("Project", project.id, "Timeline")}
                >
                  <span
                    className={`milestone-node ${m.status === "Complete" ? "complete" : ""}`}
                  >
                    {m.status === "Complete" ? (
                      <Check size={13} />
                    ) : (
                      <Diamond size={13} />
                    )}
                  </span>
                  <span>
                    <b>{m.title}</b>
                    <small>{m.phase}</small>
                  </span>
                  <span>
                    <b>{shortDate(m.due)}</b>
                    <Badge>{m.status}</Badge>
                  </span>
                </button>
              ))}
            </div>
            {!milestones.length && (
              <Empty
                title="Your plan is being shaped"
                text="Milestones appear here when your delivery lead shares them."
              />
            )}
          </Panel>
        </div>
        <aside>
          <div className="client-engagement">
            <span className="section-kicker">YOUR ENGAGEMENT</span>
            <h2>{project.name}</h2>
            <Badge>{project.health}</Badge>
            <p>{project.description}</p>
            <Progress value={progress(shared, project.id)} />
            <small>Progress from {shared.length} shared work items</small>
            <div className="client-contact">
              <Avatar id={project.owner} />
              <span>
                <b>{PEOPLE.find((p) => p.id === project.owner)?.name}</b>
                <small>Your delivery lead</small>
              </span>
            </div>
            <Button onClick={() => nav("Project", project.id)}>
              Open engagement <ArrowRight size={14} />
            </Button>
          </div>
          <Panel
            title="Latest from the team"
            subtitle="Published updates, not raw internal activity."
          >
            {updates.slice(0, 2).map((u) => (
              <div className="client-update" key={u.id}>
                <small>{shortDate(u.date)}</small>
                <h3>{u.title}</h3>
                <p>{u.body}</p>
                <button
                  className="inline-link"
                  onClick={() => nav("Project", project.id, "Updates")}
                >
                  View updates <ArrowUpRight size={13} />
                </button>
              </div>
            ))}
            {!updates.length && (
              <Empty
                title="No update published yet"
                text="Your team's shared updates will appear here."
              />
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
