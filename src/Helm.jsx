"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Compass,
  LayoutDashboard,
  FolderKanban,
  Users,
  Inbox,
  CheckCheck,
  Files,
  Sparkles,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  Check,
  LockKeyhole,
  Globe,
  Menu,
  Bell,
  Upload,
  FileText,
  Columns3,
  List,
  MessageSquare,
  Link2,
  Flag,
  Palette,
  Plug,
  Activity,
  Download,
  X,
  Briefcase,
  PanelLeftClose,
  Layers,
  Wallet,
  Workflow,
  Command,
} from "lucide-react";
import {
  upgradeDelivery,
  recordEvent,
  createRequest,
  estimateRequest,
  requestToWork,
  validateIssuePatch,
  decideApproval,
} from "./delivery-domain.mjs";
import {
  ControlRoom,
  EngagementOverview,
  DeliveryModule,
  CommandSearch,
  ClientHome,
  EngagementEditor,
} from "./components/DeliveryWorkspace";
import ConfigurationStudio from "./components/ConfigurationStudio";
import SprintWorkspace from "./components/SprintWorkspace";
import {
  SEED,
  PEOPLE,
  progress,
  makeIssue,
  publishDraft,
  localDraft,
} from "./domain.mjs";
import {
  Button,
  Avatar,
  Badge,
  Visibility,
  Empty,
  PageHeading,
  Panel,
  Modal,
  Field,
  Progress,
} from "./components/ui";
import { storeFile, getFile, extractText } from "./storage.mjs";

const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const date = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "Unscheduled";
const NAV = [
  ["Home", LayoutDashboard],
  ["Handoffs", Briefcase],
  ["Projects", FolderKanban],
  ["Customers", Users],
  ["My work", CheckCheck],
  ["Requests", Inbox],
  ["Documents", Files],
  ["Resources", Users],
  ["Time", Clock],
  ["Finance", Wallet],
  ["Reports", Activity],
  ["Templates", Layers],
  ["Automations", Workflow],
];

export default function Helm() {
  const [state, setState] = useState(() => upgradeDelivery(SEED)),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [route, setRoute] = useState({
      page: "Home",
      project: "p1",
      tab: "Overview",
    }),
    [portal, setPortal] = useState(false),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false);
  const [projectSettings, setProjectSettings] = useState(false);
  useEffect(() => {
    try {
      const data = localStorage.getItem("helm-v1");
      if (data) {
        const saved = JSON.parse(data);
        if (saved.version === 1) setState(upgradeDelivery(saved));
      }
    } catch {
      setStorageError("Local data could not be read. Demo defaults are shown.");
    }
    const hash = location.hash.slice(1).split("/");
    if (hash[0])
      setRoute({
        page: decodeURIComponent(hash[0]),
        project: hash[1] || "p1",
        tab: decodeURIComponent(hash[2] || "Overview"),
      });
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("helm-v1", JSON.stringify(state));
        setStorageError("");
      } catch {
        setStorageError(
          "Browser storage is full or unavailable. Changes are only in memory.",
        );
      }
  }, [state, ready]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const close = useCallback(() => setModal(null), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const closeProjectSettings = useCallback(() => setProjectSettings(false), []);
  useEffect(() => {
    const shortcut = (event) => {
      if (event.key === "Escape") setMobile(false);
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !portal
      ) {
        event.preventDefault();
        setSearch((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [portal]);
  useEffect(() => {
    const syncRoute = () => {
      try {
        const [page, projectId, tab] = location.hash.slice(1).split("/");
        if (page)
          setRoute({
            page: decodeURIComponent(page),
            project: projectId || "p1",
            tab: decodeURIComponent(tab || "Overview"),
          });
      } catch {
        /* Ignore malformed navigation hashes. */
      }
    };
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);
  const nav = (page, project = route.project, tab = "Overview") => {
    setRoute({ page, project, tab });
    setMobile(false);
    location.hash = `${encodeURIComponent(page)}/${project}/${encodeURIComponent(tab)}`;
  };
  const edit = (patch) => setState((s) => ({ ...s, ...patch }));
  const project =
    state.projects.find((p) => p.id === route.project) || state.projects[0];
  const customer = state.customers.find((c) => c.id === project.customer);
  const updateIssue = (id, patch) => {
    try {
      validateIssuePatch(
        state,
        state.issues.find((i) => i.id === id),
        patch,
      );
    } catch (error) {
      setNotice(error.message);
      return;
    }
    setState((s) => ({
      ...s,
      ...recordEvent(
        s,
        "issue.updated",
        s.issues.find((i) => i.id === id)?.project,
        `Updated ${id}`,
      ),
      issues: s.issues.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  };
  const createIssue = (data) => {
    const issue = makeIssue(state, data.project || project.id, data);
    edit({ issues: [...state.issues, issue] });
    setModal({ type: "issue", id: issue.id });
  };
  const createProject = (data) => {
    const c = state.customers.find(
      (c) => c.name.toLowerCase() === data.customer.toLowerCase(),
    );
    const client = c || {
      id: uid("customer"),
      name: data.customer,
      contact: data.contact || "Unassigned",
      email: "",
      industry: "New customer",
    };
    const p = {
      id: uid("project"),
      name: data.name,
      key: data.key,
      customer: client.id,
      owner: data.owner,
      description: data.description,
      health: "Draft",
      phase: "Planning",
      start: data.start,
      due: data.due,
      color: "teal",
    };
    edit({
      customers: c ? state.customers : [...state.customers, client],
      projects: [p, ...state.projects],
    });
    close();
    nav("Project", p.id, "Planning");
    setNotice("Project created locally. Add the SOW to begin planning.");
  };
  const activeIssues = state.issues.filter(
    (i) => i.project === project.id && (!portal || i.visibility === "Shared"),
  );
  const sharedProps = {
    state,
    setState,
    edit,
    nav,
    project,
    customer,
    setModal,
    setNotice,
    portal,
  };
  if (!ready)
    return (
      <div className="boot">
        <Compass size={28} />
        <span>Opening Helm…</span>
      </div>
    );
  return (
    <div className="helm-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button className="helm-brand" onClick={() => nav("Home")}>
          <span className="brand-symbol">
            <Compass size={25} strokeWidth={1.6} />
          </span>
          <span>
            helm<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="organization">
          <span className="org-avatar">7B</span>
          <div>
            <b>Seven Billion</b>
            <small>Client delivery workspace</small>
          </div>
        </div>
        <div className="nav-label">DELIVERY WORKSPACE</div>
        <nav>
          {(portal
            ? [
                ["Home", LayoutDashboard],
                ["Projects", FolderKanban],
                ["Requests", Inbox],
                ["Documents", Files],
              ]
            : NAV
          ).map(([label, Icon]) => (
            <button
              key={label}
              className={
                route.page === label ||
                (label === "Projects" && route.page === "Project")
                  ? "active"
                  : ""
              }
              onClick={() => nav(label)}
            >
              <Icon size={18} />
              {label === "Home" && !portal ? "Control room" : label}
              {label === "Requests" && (
                <span className="nav-count">
                  {
                    state.requests.filter(
                      (r) =>
                        r.status !== "Delivered" &&
                        (!portal || r.project === project.id),
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        {!portal && (
          <>
            <div className="nav-label">PINNED ENGAGEMENTS</div>
            <nav>
              {state.projects.slice(0, 3).map((p) => (
                <button
                  className="project-nav"
                  key={p.id}
                  onClick={() => nav("Project", p.id)}
                >
                  <span className={`project-dot ${p.color}`} />
                  <span>{p.name}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          {!portal && (
            <nav>
              <button
                onClick={() => nav("Design system")}
                className={route.page === "Design system" ? "active" : ""}
              >
                <Palette size={18} />
                Design system
              </button>
              <button
                onClick={() => nav("Settings")}
                className={route.page === "Settings" ? "active" : ""}
              >
                <Settings size={18} />
                Settings & integrations
              </button>
            </nav>
          )}
          <div className="profile">
            <Avatar name={portal ? customer.contact : undefined} />
            <div>
              <b>
                {portal
                  ? `${customer?.contact || "Customer"} · Preview`
                  : "Abhijit"}
              </b>
              <small>
                {portal ? customer?.name : "Workspace administrator"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>
              {portal
                ? "Customer portal"
                : route.page === "Project"
                  ? project.name
                  : route.page}
            </b>
          </div>
          <div className="topbar-right">
            {!portal && (
              <button
                className="workspace-search"
                onClick={() => setSearch(true)}
              >
                <Search size={15} />
                <span>Find anything</span>
                <kbd>⌘ K</kbd>
              </button>
            )}
            <span className="demo-pill">
              <span />
              Local demo
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                setPortal(!portal);
                nav("Home");
              }}
            >
              {portal ? <LockKeyhole size={15} /> : <Globe size={15} />}
              <span>{portal ? "Team workspace" : "Customer preview"}</span>
            </Button>
            <button
              className="icon-btn"
              aria-label="Open attention inbox"
              onClick={() => setModal({ type: "inbox" })}
            >
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <Avatar size="small" name={portal ? customer.contact : undefined} />
          </div>
        </header>
        {storageError && (
          <div className="error-banner" role="alert">
            {storageError}
          </div>
        )}
        <main className="content">
          {(route.page === "Home" ||
            (portal &&
              !["Projects", "Project", "Requests", "Documents"].includes(
                route.page,
              ))) &&
            (portal ? (
              <ClientHome {...sharedProps} />
            ) : (
              <ControlRoom {...sharedProps} />
            ))}
          {route.page === "Projects" && <Projects {...sharedProps} />}
          {route.page === "Customers" && !portal && (
            <Customers {...sharedProps} />
          )}
          {route.page === "My work" && !portal && (
            <>
              <PageHeading
                eyebrow="YOUR DAILY WORKSPACE"
                title="My work"
                description="The context you need. The next action, clear."
              />
              <Work
                issues={state.issues.filter((i) => i.owner === "ar")}
                state={state}
                updateIssue={updateIssue}
                setModal={setModal}
                createIssue={() => setModal({ type: "createIssue" })}
              />
            </>
          )}
          {route.page === "Project" && (
            <>
              <div className="project-heading">
                <div className={`customer-mark ${project.color}`}>
                  {customer.name.slice(0, 1)}
                </div>
                <div>
                  <span className="eyebrow">{customer.name}</span>
                  <h1>{project.name}</h1>
                  <p>{project.description}</p>
                </div>
                <Badge>{project.health}</Badge>
                <div className="project-heading-actions">
                  <Avatar id={project.owner} />
                  {!portal && (
                    <button
                      className="icon-btn"
                      aria-label="Edit engagement settings"
                      title="Engagement settings"
                      onClick={() => setProjectSettings(true)}
                    >
                      <Settings size={17} />
                    </button>
                  )}
                  <Button
                    onClick={() => {
                      setPortal(true);
                      nav("Home", project.id);
                    }}
                  >
                    <Globe size={15} />
                    Portal preview
                  </Button>
                </div>
              </div>
              <div className="project-tabs">
                {(portal
                  ? [
                      "Overview",
                      "Work",
                      "Timeline",
                      "UAT",
                      "Requests",
                      "Documents",
                      "Meetings",
                      "Updates",
                    ]
                  : [
                      "Overview",
                      "Work",
                      "Planning",
                      "Timeline",
                      "Risks",
                      "UAT",
                      "Requests",
                      "Documents",
                      "Meetings",
                      "Updates",
                      "Activity",
                    ]
                ).map((tab) => (
                  <button
                    className={route.tab === tab ? "active" : ""}
                    onClick={() => nav("Project", project.id, tab)}
                    key={tab}
                  >
                    {tab === "Planning" && <Sparkles size={14} />}{" "}
                    {portal && tab === "Work" ? "Deliverables" : tab}
                  </button>
                ))}
              </div>
              {route.tab === "Overview" && (
                <EngagementOverview {...sharedProps} />
              )}
              {route.tab === "Work" && (
                <Work
                  setState={setState}
                  project={project}
                  setNotice={setNotice}
                  issues={activeIssues}
                  state={state}
                  updateIssue={updateIssue}
                  setModal={setModal}
                  createIssue={
                    portal ? null : () => setModal({ type: "createIssue" })
                  }
                  readonly={portal}
                />
              )}
              {route.tab === "Planning" && !portal && (
                <Planning key={project.id} {...sharedProps} />
              )}
              {route.tab === "Requests" && <Requests {...sharedProps} scoped />}
              {route.tab === "Documents" && (
                <Documents {...sharedProps} scoped />
              )}
              {route.tab === "Updates" && <Updates {...sharedProps} />}
              {["Timeline", "Risks", "UAT", "Meetings", "Activity"].includes(
                route.tab,
              ) &&
                (!portal || route.tab !== "Activity") && (
                  <DeliveryModule
                    key={`${project.id}/${route.tab}/${portal}`}
                    {...sharedProps}
                    module={route.tab}
                    scoped
                  />
                )}
            </>
          )}
          {route.page === "Requests" && <Requests {...sharedProps} />}
          {route.page === "Documents" && <Documents {...sharedProps} />}
          {route.page === "Settings" && !portal && (
            <ConfigurationStudio {...sharedProps}>
              <SettingsPage {...sharedProps} />
            </ConfigurationStudio>
          )}
          {route.page === "Design system" && !portal && <DesignSystem />}
          {!portal &&
            [
              "Resources",
              "Time",
              "Finance",
              "Reports",
              "Templates",
              "Automations",
              "Handoffs",
            ].includes(route.page) && (
              <DeliveryModule
                key={route.page}
                {...sharedProps}
                module={route.page}
              />
            )}
        </main>
        <footer className="workspace-footer">
          Helm by Seven Billion
          <span>
            Demo data · Saved in this browser · Services not connected
          </span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {search && !portal && (
        <CommandSearch state={state} nav={nav} onClose={closeSearch} />
      )}
      {projectSettings && !portal && (
        <EngagementEditor {...sharedProps} onClose={closeProjectSettings} />
      )}
      {modal && (
        <Modal
          title={
            {
              createProject: "Create a new engagement",
              createIssue: "Create issue",
              issue: "Issue details",
              request: "Request details",
              createRequest: "New request",
              approval: "Review approval",
              update: "Publish a project update",
              inbox: "Your attention inbox",
            }[modal.type] || "Details"
          }
          onClose={close}
          wide={modal.type === "issue"}
        >
          {modal.type === "createProject" && (
            <ProjectForm
              onSubmit={createProject}
              customers={state.customers}
              projects={state.projects}
              onClose={close}
            />
          )}
          {modal.type === "createIssue" && (
            <IssueForm
              project={project}
              onSubmit={createIssue}
              onClose={close}
            />
          )}
          {modal.type === "issue" &&
            (!portal ||
              state.issues.some(
                (i) =>
                  i.id === modal.id &&
                  i.project === project.id &&
                  i.visibility === "Shared",
              )) && (
              <IssueDetail
                issue={state.issues.find((i) => i.id === modal.id)}
                workflow={state.workflow}
                state={state}
                update={(patch) => updateIssue(modal.id, patch)}
                portal={portal}
              />
            )}
          {modal.type === "createRequest" && (
            <RequestForm
              projects={portal ? [project] : state.projects}
              project={project}
              onSubmit={(data) => {
                setState(createRequest(state, data));
                close();
                setNotice("Request created in the local workspace.");
              }}
            />
          )}
          {modal.type === "request" && (
            <RequestDetail
              request={state.requests.find((r) => r.id === modal.id)}
              portal={portal}
              onEstimate={(estimate) => {
                try {
                  setState(estimateRequest(state, modal.id, estimate));
                  setNotice(
                    "Estimate version frozen. Approval requested locally.",
                  );
                } catch (error) {
                  setNotice(error.message);
                }
              }}
              onCreateWork={() => {
                try {
                  setState(requestToWork(state, modal.id));
                  setNotice("Approved request linked to delivery work.");
                } catch (error) {
                  setNotice(error.message);
                }
              }}
              onUpdate={(patch) =>
                edit({
                  requests: state.requests.map((r) =>
                    r.id === modal.id ? { ...r, ...patch } : r,
                  ),
                })
              }
            />
          )}
          {modal.type === "approval" && (
            <Approval
              approval={state.approvals.find((a) => a.id === modal.id)}
              onDecision={(patch) => {
                try {
                  setState(
                    decideApproval(
                      state,
                      modal.id,
                      patch.status,
                      patch.comment,
                    ),
                  );
                } catch (error) {
                  setNotice(error.message);
                  return;
                }
                close();
                setNotice("Decision recorded locally against this version.");
              }}
            />
          )}
          {modal.type === "update" && (
            <UpdateForm
              onSubmit={(data) => {
                edit({
                  updates: [
                    {
                      id: uid("UPD"),
                      project: project.id,
                      date: new Date().toISOString().slice(0, 10),
                      visibility: "Shared",
                      ...data,
                    },
                    ...state.updates,
                  ],
                });
                close();
                setNotice(
                  "Update published to the local customer preview. No email sent.",
                );
              }}
            />
          )}
          {modal.type === "inbox" && (
            <div className="modal-body">
              <p className="muted">
                Open actions across your local demo workspace.
              </p>
              {state.approvals
                .filter(
                  (a) =>
                    a.status === "Pending" &&
                    (!portal || a.project === project.id),
                )
                .map((a) => (
                  <button
                    className="action-row"
                    key={a.id}
                    onClick={() => setModal({ type: "approval", id: a.id })}
                  >
                    <span className="action-icon purple">
                      <CheckCheck size={18} />
                    </span>
                    <span>
                      <b>{a.title}</b>
                      <small>Approval pending · Version {a.version}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              {state.requests
                .filter(
                  (r) =>
                    r.status === "Submitted" &&
                    (!portal || r.project === project.id),
                )
                .map((r) => (
                  <button
                    className="action-row"
                    key={r.id}
                    onClick={() => setModal({ type: "request", id: r.id })}
                  >
                    <Inbox size={18} />
                    <span>
                      <b>{r.title}</b>
                      <small>Request awaiting triage</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function ProjectTable({ state, nav, projects = state.projects }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Project / Customer</th>
            <th>Status</th>
            <th>Current phase</th>
            <th>Progress</th>
            <th>Owner</th>
            <th>Target date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <button
                  className="project-name"
                  onClick={() => nav("Project", p.id)}
                >
                  <span className={`customer-mark small ${p.color}`}>
                    {state.customers.find((c) => c.id === p.customer)?.name[0]}
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {state.customers.find((c) => c.id === p.customer)?.name}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <Badge>{p.health}</Badge>
              </td>
              <td>{p.phase}</td>
              <td>
                <Progress value={progress(state.issues, p.id)} />
              </td>
              <td>
                <Avatar id={p.owner} />
              </td>
              <td>{date(p.due)}</td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={`Open ${p.name}`}
                  onClick={() => nav("Project", p.id)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Projects({ state, nav, setModal, portal, project }) {
  const [query, setQuery] = useState("");
  const items = (portal ? [project] : state.projects).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="CLIENT DELIVERY"
        title="Projects"
        description="Every engagement, connected to the people and context behind it."
      >
        {!portal && (
          <Button
            variant="primary"
            onClick={() => setModal({ type: "createProject" })}
          >
            <Plus size={16} />
            New project
          </Button>
        )}
      </PageHeading>
      <div className="view-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search projects…"
        />
        <span className="muted">{items.length} projects</span>
      </div>
      <Panel title="All engagements">
        <ProjectTable
          state={
            portal
              ? {
                  ...state,
                  issues: state.issues.filter((i) => i.visibility === "Shared"),
                }
              : state
          }
          projects={items}
          nav={nav}
        />
        {!items.length && (
          <Empty
            title="No matching projects"
            text="Try a different project name."
          />
        )}
      </Panel>
    </>
  );
}
function Customers({ state, nav }) {
  return (
    <>
      <PageHeading
        eyebrow="RELATIONSHIPS THAT LAST"
        title="Customers"
        description="The people, projects and history behind every engagement."
      />
      <div className="customer-grid">
        {state.customers.map((c) => (
          <section className="customer-card" key={c.id}>
            <div className="customer-card-top">
              <span className="customer-mark teal">{c.name[0]}</span>
              <Badge tone="neutral">{c.industry}</Badge>
            </div>
            <h2>{c.name}</h2>
            <p>{c.contact} · Primary contact</p>
            <div className="customer-projects">
              {state.projects
                .filter((p) => p.customer === c.id)
                .map((p) => (
                  <button key={p.id} onClick={() => nav("Project", p.id)}>
                    <FolderKanban size={15} />
                    {p.name}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Work({
  issues,
  state,
  updateIssue,
  setModal,
  createIssue,
  readonly = false,
  setState,
  project,
  setNotice,
}) {
  const [view, setView] = useState(readonly ? "List" : "Board"),
    [query, setQuery] = useState(""),
    [owner, setOwner] = useState("all");
  const activeSprint =
    project &&
    state.sprints.some(
      (s) => s.project === project.id && s.status === "Active",
    );
  const filtered = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(query.toLowerCase()) &&
      (view !== "Backlog" ||
        i.status !== "Done" ||
        (i.sprint && activeSprint)) &&
      (owner === "all" || i.owner === owner),
  );
  return (
    <>
      <div className="view-toolbar">
        <div className="segmented">
          {(readonly ? ["List"] : ["Board", "List", "Backlog"]).map((v) => (
            <button
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
              key={v}
            >
              {v === "Board" ? <Columns3 size={15} /> : <List size={15} />} {v}
            </button>
          ))}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search work…"
        />
        <select
          aria-label="Filter by assignee"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">All assignees</option>
          {PEOPLE.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        {createIssue && (
          <Button variant="primary" onClick={createIssue}>
            <Plus size={15} />
            Create issue
          </Button>
        )}
      </div>
      {view === "Backlog" && !readonly && project && (
        <SprintWorkspace
          state={state}
          setState={setState}
          project={project}
          setNotice={setNotice}
        />
      )}
      {view === "Board" ? (
        <div className="work-board">
          {state.workflow.map((status, index) => (
            <section
              className="board-column"
              key={status}
              onDragOver={(e) => {
                if (!readonly) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!readonly)
                  updateIssue(e.dataTransfer.getData("text/plain"), { status });
              }}
            >
              <header>
                <span className={`status-dot tone-${index}`} />
                <b>{status}</b>
                <span>
                  {filtered.filter((i) => i.status === status).length}
                </span>
              </header>
              {filtered
                .filter((i) => i.status === status)
                .map((i) => (
                  <article
                    className="work-card"
                    key={i.id}
                    draggable={!readonly}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", i.id)
                    }
                  >
                    <button
                      className="work-card-open"
                      onClick={() => setModal({ type: "issue", id: i.id })}
                    >
                      <div>
                        <span className={`issue-type ${i.type.toLowerCase()}`}>
                          {i.type}
                        </span>
                        <Visibility value={i.visibility} />
                      </div>
                      <h3>{i.title}</h3>
                      <span className="phase-chip">{i.phase}</span>
                      <footer>
                        <span>{i.id}</span>
                        <span className="points">{i.points}</span>
                        <Avatar id={i.owner} size="small" />
                      </footer>
                    </button>
                  </article>
                ))}
              {createIssue && (
                <button className="add-work" onClick={createIssue}>
                  <Plus size={14} />
                  Add issue
                </button>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Panel
          title={view === "Backlog" ? "Sprint and backlog" : "All work"}
          subtitle={
            view === "Backlog"
              ? "Move work into or out of the current sprint."
              : `${filtered.length} work items`
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Points</th>
                  <th>{view === "Backlog" ? "Sprint" : "Due date"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => setModal({ type: "issue", id: i.id })}
                      >
                        <span className="muted">{i.id}</span> {i.title}
                      </button>
                    </td>
                    <td>
                      <Badge>{i.status}</Badge>
                    </td>
                    <td>
                      <Avatar id={i.owner} size="small" label />
                    </td>
                    <td>{i.points}</td>
                    <td>
                      {view === "Backlog" && !readonly ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            updateIssue(i.id, { sprint: !i.sprint })
                          }
                        >
                          {i.sprint ? "Current sprint" : "Backlog"}
                          <ArrowRight size={13} />
                        </Button>
                      ) : view === "Backlog" ? (
                        i.sprint ? (
                          "Current sprint"
                        ) : (
                          "Backlog"
                        )
                      ) : (
                        date(i.due)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <Empty
              title="No work matches"
              text="Change the filters or create your first issue."
            />
          )}
        </Panel>
      )}
    </>
  );
}

function Planning({ state, setState, project, setNotice, nav }) {
  const draft = state.drafts[project.id];
  const [text, setText] = useState(draft?.source || ""),
    [fileName, setFileName] = useState(draft?.fileName || ""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const save = (d) =>
    setState((s) => ({ ...s, drafts: { ...s.drafts, [project.id]: d } }));
  const updateItem = (id, patch) =>
    save({
      ...draft,
      pmApproved: false,
      items: draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy("Extracting document text…");
    setError("");
    try {
      const content = await extractText(file);
      setText(content);
      setFileName(file.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
      e.target.value = "";
    }
  };
  const generate = async () => {
    setError("");
    setBusy("Preparing AI draft…");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, project: project.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      save({
        ...data,
        source: text,
        fileName,
        published: false,
        pmApproved: false,
        mode: "ai",
      });
      setNotice("Tentative AI plan prepared for developer review.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <div className="planning-intro">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> SOW TO DELIVERY
          </span>
          <h2>A thoughtful start to every project.</h2>
          <p>
            Turn agreed scope into a plan your team can review, refine and own.
          </p>
        </div>
        <Badge tone="purple">Tentative until approved</Badge>
      </div>
      <div className="planning-steps">
        {[
          "Upload scope",
          "Developer review",
          "PM approval",
          "Publish plan",
        ].map((step, index) => (
          <div
            className={
              draft
                ? draft.published || index === 1
                  ? "active"
                  : ""
                : index === 0
                  ? "active"
                  : ""
            }
            key={step}
          >
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </div>
      {!draft || draft.published ? (
        <div className="planning-grid">
          <Panel
            title={
              draft?.published
                ? "Published plan"
                : "Start with the statement of work"
            }
            subtitle={
              draft?.published
                ? "This draft is frozen. Create a separate project for new scope in this initial build."
                : "Upload a document or paste the agreed scope."
            }
          >
            {draft?.published ? (
              <div className="modal-body">
                <Badge>Approved</Badge>
                <p>
                  {draft.items.length} reviewed items published to the project.
                </p>
                <Button
                  variant="primary"
                  onClick={() => nav("Project", project.id, "Work")}
                >
                  Open project work
                  <ArrowRight size={15} />
                </Button>
              </div>
            ) : (
              <div className="modal-body">
                <label className="upload-zone">
                  <Upload size={25} />
                  <b>Choose your SOW</b>
                  <span>PDF, DOCX, TXT or Markdown · up to 25 MB</span>
                  <input
                    aria-label="Upload statement of work"
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={upload}
                  />
                </label>
                {fileName && (
                  <p className="file-note">
                    <FileText size={14} />
                    {fileName}
                  </p>
                )}
                <Field label="Scope text">
                  <textarea
                    rows={8}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste the scope, deliverables, acceptance criteria and constraints…"
                  />
                </Field>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                {busy && <p role="status">{busy}</p>}
                <div className="button-row">
                  <Button
                    variant="primary"
                    disabled={text.trim().length < 30 || !!busy}
                    onClick={generate}
                  >
                    <Sparkles size={15} />
                    Generate with AI
                  </Button>
                  <Button
                    disabled={text.trim().length < 30 || !!busy}
                    onClick={() => {
                      const d = localDraft(text);
                      if (!d.items.length) {
                        setError(
                          "Paste scope as separate lines of 16–239 characters to create manual plan items.",
                        );
                        return;
                      }
                      save({ ...d, fileName });
                    }}
                  >
                    Create manual draft
                  </Button>
                </div>
                <p className="caption">
                  AI generation requires authenticated Supabase access and a
                  server-side Anthropic key. Manual drafts use your text
                  directly.
                </p>
              </div>
            )}
          </Panel>
          <Panel title="A plan, with provenance">
            <div className="planning-principles">
              {[
                [
                  Link2,
                  "Scope stays traceable",
                  "Source passages travel with each proposed item.",
                ],
                [
                  Users,
                  "Your team owns the plan",
                  "Developers review the breakdown and estimates.",
                ],
                [
                  LockKeyhole,
                  "Publish with intention",
                  "PM approval is required before work is created.",
                ],
              ].map(([Icon, title, text]) => (
                <div key={title}>
                  <span className="action-icon teal">
                    <Icon size={18} />
                  </span>
                  <div>
                    <b>{title}</b>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="soft-note">
              Estimates are tentative. Dates and capacity must be reviewed by
              the delivery lead.
            </div>
          </Panel>
        </div>
      ) : (
        <>
          <div className="review-toolbar">
            <div>
              <Badge tone={draft.mode === "ai" ? "purple" : "neutral"}>
                {draft.mode === "ai" ? "AI draft" : "Manual draft"}
              </Badge>
              <span>
                {draft.items.filter((i) => i.reviewed).length} of{" "}
                {draft.items.length} reviewed
              </span>
            </div>
            <Button
              onClick={() =>
                save({
                  ...draft,
                  pmApproved: false,
                  items: [
                    ...draft.items,
                    {
                      id: uid("item"),
                      title: "",
                      description: "",
                      phase: "Delivery",
                      points: 0,
                      classification: "Assumption",
                      source: "Added by reviewer",
                      reviewed: false,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Add work item
            </Button>
          </div>
          <div className="review-grid">
            <Panel
              title="Original scope"
              subtitle={fileName || "Pasted SOW text"}
            >
              <pre className="source-text">{draft.source}</pre>
            </Panel>
            <div className="plan-items">
              {draft.items.map((item, index) => (
                <section className="plan-item" key={item.id}>
                  <header>
                    <span>ITEM {index + 1}</span>
                    <Badge
                      tone={
                        item.classification === "Contractual scope"
                          ? "teal"
                          : "neutral"
                      }
                    >
                      {item.classification}
                    </Badge>
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={item.reviewed}
                        onChange={(e) =>
                          updateItem(item.id, { reviewed: e.target.checked })
                        }
                      />
                      Reviewed
                    </label>
                  </header>
                  <Field label="Work item">
                    <input
                      value={item.title}
                      onChange={(e) =>
                        updateItem(item.id, {
                          title: e.target.value,
                          reviewed: false,
                        })
                      }
                    />
                  </Field>
                  <div className="two-fields">
                    <Field label="Phase">
                      <input
                        value={item.phase}
                        onChange={(e) =>
                          updateItem(item.id, {
                            phase: e.target.value,
                            reviewed: false,
                          })
                        }
                      />
                    </Field>
                    <Field label="Story points (reviewed)">
                      <input
                        type="number"
                        min="0"
                        value={item.points}
                        onChange={(e) =>
                          updateItem(item.id, {
                            points: +e.target.value,
                            reviewed: false,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Acceptance / implementation notes">
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.id, {
                          description: e.target.value,
                          reviewed: false,
                        })
                      }
                    />
                  </Field>
                  <div className="source-citation">
                    <Link2 size={13} />
                    {item.source ||
                      "No source citation supplied; reviewer must verify scope."}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="publish-bar">
            <label>
              <input
                type="checkbox"
                checked={draft.pmApproved}
                disabled={draft.items.some(
                  (i) => !i.reviewed || !i.title.trim(),
                )}
                onChange={(e) =>
                  save({ ...draft, pmApproved: e.target.checked })
                }
              />{" "}
              PM reviewed scope, estimates and customer commitments
            </label>
            <Button
              variant="primary"
              disabled={!draft.pmApproved}
              onClick={() => {
                try {
                  setState((s) => publishDraft(s, project.id));
                  setNotice(
                    "Reviewed plan published locally. Issues are now on the board.",
                  );
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Publish project plan
              <ArrowRight size={15} />
            </Button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </>
      )}
    </>
  );
}

function Requests({ state, project, portal, scoped, setModal }) {
  const list = state.requests.filter(
    (r) => (!portal && !scoped) || r.project === project.id,
  );
  return (
    <>
      <PageHeading
        title="Requests"
        description="Capture the need. Keep the conversation and decision together."
      >
        <Button
          variant="primary"
          onClick={() => setModal({ type: "createRequest" })}
        >
          <Plus size={15} />
          New request
        </Button>
      </PageHeading>
      <Panel title="Request inbox">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Project</th>
                <th>Type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="text-link"
                      onClick={() => setModal({ type: "request", id: r.id })}
                    >
                      <small>{r.id}</small>
                      {r.title}
                    </button>
                  </td>
                  <td>
                    {state.projects.find((p) => p.id === r.project)?.name}
                  </td>
                  <td>{r.type}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Open ${r.title}`}
                      onClick={() => setModal({ type: "request", id: r.id })}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            title="No requests yet"
            text="Your next requirement, question or enhancement starts here."
          />
        )}
      </Panel>
    </>
  );
}
function Documents({ state, project, portal, scoped, edit, setNotice }) {
  const [error, setError] = useState("");
  const docs = state.documents.filter(
    (d) =>
      ((!portal && !scoped) || d.project === project.id) &&
      (!portal || d.visibility === "Shared"),
  );
  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    try {
      if (f.size > 25 * 1024 * 1024)
        throw new Error("Maximum file size is 25 MB.");
      const id = uid("doc");
      await storeFile(id, f);
      edit({
        documents: [
          ...state.documents,
          {
            id,
            project: project.id,
            name: f.name,
            size: f.size,
            visibility: portal ? "Shared" : "Internal",
            date: new Date().toISOString().slice(0, 10),
          },
        ],
      });
      setNotice("File stored in this browser.");
    } catch (e) {
      setError(e.message);
    } finally {
      e.target.value = "";
    }
  };
  const download = async (d) => {
    try {
      const f = await getFile(d.id);
      if (!f) throw new Error("This file is not available in this browser.");
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <>
      <PageHeading
        title="Documents"
        description="The source of truth, kept close to the work."
      >
        <label className="btn primary">
          <Upload size={15} />
          Upload file
          <input
            aria-label="Upload document"
            type="file"
            className="visually-hidden"
            onChange={upload}
          />
        </label>
      </PageHeading>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Panel
        title={portal ? "Shared documents" : "Project files"}
        subtitle="Local files are stored in this browser, not uploaded to a cloud service."
      >
        {docs.map((d) => (
          <div className="document-row" key={d.id}>
            <span className="action-icon teal">
              <FileText size={19} />
            </span>
            <div>
              <b>{d.name}</b>
              <small>
                {Math.ceil(d.size / 1024)} KB · {date(d.date)}
              </small>
            </div>
            {!portal ? (
              <select
                aria-label={`Visibility of ${d.name}`}
                value={d.visibility}
                onChange={(e) =>
                  edit({
                    documents: state.documents.map((x) =>
                      x.id === d.id ? { ...x, visibility: e.target.value } : x,
                    ),
                  })
                }
              >
                <option>Internal</option>
                <option>Shared</option>
              </select>
            ) : (
              <Visibility value="Shared" />
            )}
            <Button onClick={() => download(d)}>
              <Download size={14} />
              Download
            </Button>
          </div>
        ))}
        {!docs.length && (
          <Empty
            icon={Files}
            title="A place for your project knowledge"
            text="Upload requirements, specifications, deliverables or handover documents."
          />
        )}
      </Panel>
    </>
  );
}
function Updates({ state, project, portal, setModal }) {
  const updates = state.updates.filter(
    (u) => u.project === project.id && (!portal || u.visibility === "Shared"),
  );
  return (
    <>
      <PageHeading
        title={portal ? "Latest from your team" : "Project updates"}
        description="Progress, decisions and next steps, in plain language."
      >
        {!portal && (
          <Button
            variant="primary"
            onClick={() => setModal({ type: "update" })}
          >
            <Plus size={15} />
            Publish update
          </Button>
        )}
      </PageHeading>
      <div className="updates-feed">
        {updates.map((u) => (
          <article className="update-card" key={u.id}>
            <header>
              <Avatar id={project.owner} label />
              <span>{date(u.date)}</span>
              <Visibility value={u.visibility} />
            </header>
            <h2>{u.title}</h2>
            <p>{u.body}</p>
          </article>
        ))}
        {!updates.length && (
          <Empty
            title="The story starts here"
            text="Your published project updates will appear here."
          />
        )}
      </div>
    </>
  );
}

function ProjectForm({ onSubmit, onClose, customers, projects }) {
  const [data, setData] = useState({
      name: "",
      customer: "",
      key: "",
      owner: "rk",
      start: "",
      due: "",
      description: "",
    }),
    [error, setError] = useState("");
  const field = (key, label, type = "text") => (
    <Field label={label}>
      <input
        required={["name", "customer", "key"].includes(key)}
        type={type}
        value={data[key]}
        onChange={(e) =>
          setData({
            ...data,
            [key]:
              key === "key"
                ? e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6)
                : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (projects.some((p) => p.key === data.key)) {
          setError("Choose a unique project key.");
          return;
        }
        if (data.start && data.due && data.due < data.start) {
          setError("Target date must follow kickoff.");
          return;
        }
        onSubmit(data);
      }}
    >
      <p className="muted">
        Start manually now. HubSpot automation becomes available when connected.
      </p>
      {field("name", "Project name")}
      {field("customer", "Customer name")}
      {field("key", "Project key (unique)")}
      <Field label="Delivery lead">
        <select
          value={data.owner}
          onChange={(e) => setData({ ...data, owner: e.target.value })}
        >
          {PEOPLE.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="two-fields">
        {field("start", "Kickoff date", "date")}
        {field("due", "Target date", "date")}
      </div>
      {field("description", "Engagement summary")}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button onClick={onClose} type="button">
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Create engagement
          <ArrowRight size={14} />
        </Button>
      </div>
    </form>
  );
}
function IssueForm({ project, onSubmit, onClose }) {
  const [data, setData] = useState({
    title: "",
    type: "Task",
    description: "",
    visibility: "Internal",
  });
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...data, project: project.id });
      }}
    >
      <p className="muted">{project.name}</p>
      <Field label="Summary">
        <input
          required
          value={data.title}
          onChange={(e) => setData({ ...data, title: e.target.value })}
        />
      </Field>
      <div className="two-fields">
        <Field label="Issue type">
          <select
            value={data.type}
            onChange={(e) => setData({ ...data, type: e.target.value })}
          >
            {["Epic", "Story", "Task", "Bug", "Subtask"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Visibility">
          <select
            value={data.visibility}
            onChange={(e) => setData({ ...data, visibility: e.target.value })}
          >
            <option>Internal</option>
            <option>Shared</option>
          </select>
        </Field>
      </div>
      <Field label="Description and acceptance criteria">
        <textarea
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
        />
      </Field>
      <div className="form-footer">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Create issue
        </Button>
      </div>
    </form>
  );
}
function IssueDetail({ issue, workflow, state, update, portal }) {
  const [comment, setComment] = useState(""),
    [audience, setAudience] = useState(portal ? "Shared" : "Internal");
  return (
    <div className="modal-body">
      <div className="issue-meta">
        <span className="issue-type">{issue.type}</span>
        <span>{issue.id}</span>
        <Visibility value={issue.visibility} />
      </div>
      <Field label="Summary">
        <input
          value={issue.title}
          readOnly={portal}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>
      <div className="two-fields">
        <Field label="Status">
          <select
            value={issue.status}
            disabled={portal}
            onChange={(e) => update({ status: e.target.value })}
          >
            {workflow.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Assignee">
          <select
            value={issue.owner}
            disabled={portal}
            onChange={(e) => update({ owner: e.target.value })}
          >
            {PEOPLE.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description / acceptance">
        <textarea
          rows={5}
          value={issue.description}
          readOnly={portal}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      {!portal && issue.sourcePlan && (
        <div className="source-provenance">
          <span className="section-kicker">
            REVIEWED PLAN SOURCE · V{issue.sourcePlan.draftVersion}
          </span>
          <Badge>{issue.sourcePlan.classification}</Badge>
          <p>
            {issue.sourcePlan.source ||
              "No source passage attached. Review this assumption."}
          </p>
        </div>
      )}
      {!portal &&
        (issue.sourceRequest || issue.sourceMeeting || issue.sourceTest) && (
          <p className="caption">
            Origin:{" "}
            {issue.sourceRequest || issue.sourceMeeting || issue.sourceTest} ·
            Source-linked delivery work
          </p>
        )}
      {!portal && (
        <div className="two-fields">
          <Field label="Story points">
            <input
              type="number"
              min="0"
              value={issue.points}
              onChange={(e) => update({ points: +e.target.value })}
            />
          </Field>
          <Field label="Visibility">
            <select
              value={issue.visibility}
              onChange={(e) => update({ visibility: e.target.value })}
            >
              <option>Internal</option>
              <option>Shared</option>
            </select>
          </Field>
        </div>
      )}
      {!portal && (
        <div className="issue-structure">
          <h3>Delivery structure</h3>
          <div className="two-fields">
            <Field label="Priority">
              <select
                value={issue.priority || "Medium"}
                onChange={(e) => update({ priority: e.target.value })}
              >
                {["Critical", "High", "Medium", "Low"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={issue.due || ""}
                onChange={(e) => update({ due: e.target.value })}
              />
            </Field>
          </div>
          <div className="two-fields">
            <Field label="Parent work item">
              <select
                value={issue.parent || ""}
                onChange={(e) => update({ parent: e.target.value })}
              >
                <option value="">No parent</option>
                {state.issues
                  .filter(
                    (i) =>
                      i.project === issue.project &&
                      i.id !== issue.id &&
                      ["Epic", "Story", "Task"].includes(i.type),
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.id} · {i.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Delivery phase">
              <input
                value={issue.phase || ""}
                onChange={(e) => update({ phase: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Blocked by">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  update({
                    dependencies: [
                      ...(issue.dependencies || []),
                      e.target.value,
                    ],
                  });
              }}
            >
              <option value="">Link blocking work…</option>
              {state.issues
                .filter(
                  (i) =>
                    i.project === issue.project &&
                    i.id !== issue.id &&
                    !(issue.dependencies || []).includes(i.id),
                )
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} · {i.title}
                  </option>
                ))}
            </select>
          </Field>
          <div className="dependency-chips">
            {(issue.dependencies || []).map((id) => (
              <button
                key={id}
                onClick={() =>
                  update({
                    dependencies: issue.dependencies.filter(
                      (value) => value !== id,
                    ),
                  })
                }
              >
                {id} · {state.issues.find((i) => i.id === id)?.status}{" "}
                <X size={12} />
              </button>
            ))}
          </div>
        </div>
      )}
      <h3>Discussion</h3>
      {state.fieldDefinitions.filter(
        (f) => !portal || f.visibility === "Shared",
      ).length > 0 && (
        <div className="custom-fields">
          <h3>Work context</h3>
          {state.fieldDefinitions
            .filter((f) => !portal || f.visibility === "Shared")
            .map((f) => (
              <Field
                key={f.id}
                label={`${f.name}${f.requiredOnDone ? " · Required before Done" : ""}`}
              >
                <input
                  type={f.type}
                  readOnly={portal}
                  value={issue.customFields?.[f.id] || ""}
                  onChange={(e) =>
                    update({
                      customFields: {
                        ...issue.customFields,
                        [f.id]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            ))}
        </div>
      )}
      {issue.comments
        .filter((c) => !portal || c.visibility === "Shared")
        .map((c) => (
          <div className="comment" key={c.id}>
            <Avatar
              id={c.owner}
              name={c.owner === "customer" ? "Customer" : undefined}
            />
            <div>
              <b>{c.owner === "customer" ? "Customer preview" : "Abhijit"}</b>
              <Visibility value={c.visibility} />
              <p>{c.text}</p>
            </div>
          </div>
        ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          update({
            comments: [
              ...issue.comments,
              {
                id: uid("comment"),
                text: comment,
                owner: portal ? "customer" : "ar",
                visibility: audience,
                date: new Date().toISOString(),
              },
            ],
          });
          setComment("");
        }}
      >
        <Field label="Add a comment">
          <textarea
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Keep the context close to the work…"
          />
        </Field>
        <div className="button-row">
          {!portal && (
            <select
              aria-label="Comment visibility"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option>Internal</option>
              <option>Shared</option>
            </select>
          )}
          <Button variant="primary" type="submit">
            Post comment
          </Button>
        </div>
      </form>
    </div>
  );
}
function RequestForm({ projects, project, onSubmit }) {
  const [data, setData] = useState({
    title: "",
    description: "",
    project: project.id,
    type: "Enhancement",
  });
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(data);
      }}
    >
      <Field label="What do you need?">
        <input
          required
          value={data.title}
          onChange={(e) => setData({ ...data, title: e.target.value })}
        />
      </Field>
      <Field label="Project">
        <select
          value={data.project}
          onChange={(e) => setData({ ...data, project: e.target.value })}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select
          value={data.type}
          onChange={(e) => setData({ ...data, type: e.target.value })}
        >
          {[
            "Enhancement",
            "Requirement",
            "Bug",
            "Support",
            "Clarification",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Business context and desired outcome">
        <textarea
          required
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
        />
      </Field>
      <div className="form-footer">
        <Button variant="primary" type="submit">
          Submit request
          <ArrowRight size={14} />
        </Button>
      </div>
    </form>
  );
}
function RequestDetail({
  request,
  portal,
  onUpdate,
  onEstimate,
  onCreateWork,
}) {
  const [estimate, setEstimate] = useState({
    scope: request.estimate?.scope || "",
    criteria: request.estimate?.criteria || "",
    exclusions: request.estimate?.exclusions || "",
    hours: request.estimate?.hours || 8,
  });
  return (
    <div className="modal-body">
      <span className="eyebrow">
        {request.id} · {request.type}
      </span>
      <h2>{request.title}</h2>
      <p className="request-description">{request.description}</p>
      {portal ? (
        <Badge>{request.status}</Badge>
      ) : (
        <Field label="Request stage">
          <select
            value={request.status}
            onChange={(e) => onUpdate({ status: e.target.value })}
          >
            {[
              "Submitted",
              "Under review",
              "Clarification needed",
              "Estimated",
              "Awaiting approval",
              "Approved",
              "Scheduled",
              "In delivery",
              "UAT",
              "Delivered",
              "Cancelled",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="soft-note">
        The request stays linked to its original customer context. Commercial
        changes require a separate approval.
      </div>
      {request.estimate && (
        <div className="request-estimate">
          <h3>Estimate v{request.estimateVersion}</h3>
          <p>{request.estimate.scope}</p>
          <small>
            {request.estimate.hours}h tentative effort · Acceptance:{" "}
            {request.estimate.criteria}
          </small>
        </div>
      )}
      {!portal && (
        <form
          className="request-estimate"
          onSubmit={(e) => {
            e.preventDefault();
            onEstimate(estimate);
          }}
        >
          <h3>Versioned scope & estimate</h3>
          <Field label="Proposed scope">
            <textarea
              required
              value={estimate.scope}
              onChange={(e) =>
                setEstimate({ ...estimate, scope: e.target.value })
              }
            />
          </Field>
          <Field label="Acceptance criteria">
            <textarea
              required
              value={estimate.criteria}
              onChange={(e) =>
                setEstimate({ ...estimate, criteria: e.target.value })
              }
            />
          </Field>
          <div className="two-fields">
            <Field label="Tentative effort (hours)">
              <input
                type="number"
                required
                min="0.25"
                step="0.25"
                value={estimate.hours}
                onChange={(e) =>
                  setEstimate({ ...estimate, hours: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Exclusions">
              <input
                value={estimate.exclusions}
                onChange={(e) =>
                  setEstimate({ ...estimate, exclusions: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="button-row">
            <Button type="submit">Request approval of this version</Button>
            <Button
              type="button"
              variant="primary"
              onClick={onCreateWork}
              disabled={!!request.issue}
            >
              {request.issue
                ? `Linked: ${request.issue}`
                : "Create approved work"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
function Approval({ approval, onDecision }) {
  const [comment, setComment] = useState("");
  return (
    <div className="modal-body">
      <Badge>{approval.status}</Badge>
      <h2>{approval.title}</h2>
      <p>{approval.summary}</p>
      <div className="soft-note">
        Reviewing version {approval.version}. Your decision is recorded against
        this version.
      </div>
      {approval.estimate && (
        <div className="approval-baseline">
          <h3>The scope you're deciding on</h3>
          <dl>
            <dt>Effort estimate</dt>
            <dd>{approval.estimate.hours} hours · Tentative</dd>
            <dt>Acceptance criteria</dt>
            <dd>{approval.estimate.criteria}</dd>
            <dt>Exclusions</dt>
            <dd>
              {approval.estimate.exclusions ||
                "No exclusions specified. Ask for clarification if needed."}
            </dd>
          </dl>
        </div>
      )}
      {approval.status === "Pending" ? (
        <>
          <Field label="Review comment (required for changes)">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <div className="form-footer">
            <Button
              disabled={!comment.trim()}
              onClick={() =>
                onDecision({ status: "Changes requested", comment })
              }
            >
              Request changes
            </Button>
            <Button
              variant="primary"
              onClick={() => onDecision({ status: "Approved", comment })}
            >
              <Check size={15} />
              Approve version {approval.version}
            </Button>
          </div>
        </>
      ) : (
        <p className="muted">
          Decision recorded{approval.comment ? `: ${approval.comment}` : "."}
        </p>
      )}
    </div>
  );
}
function UpdateForm({ onSubmit }) {
  const [data, setData] = useState({ title: "", body: "" });
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(data);
      }}
    >
      <Field label="Update title">
        <input
          required
          value={data.title}
          onChange={(e) => setData({ ...data, title: e.target.value })}
        />
      </Field>
      <Field label="Completed, in progress, waiting on customer, and next steps">
        <textarea
          rows={7}
          required
          value={data.body}
          onChange={(e) => setData({ ...data, body: e.target.value })}
        />
      </Field>
      <p className="caption">
        Shared in the local customer preview. Review the content before
        publishing.
      </p>
      <div className="form-footer">
        <Button variant="primary" type="submit">
          Publish shared update
        </Button>
      </div>
    </form>
  );
}

function SettingsPage({ state, edit, setNotice }) {
  const [newStatus, setNewStatus] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="MAKE HELM YOUR OWN"
        title="Settings & integrations"
        description="Configure the work. Connect the tools that carry your business."
      />
      <div className="dashboard-grid">
        <Panel
          title="Project workflow"
          subtitle="Shared local workflow for the initial build."
        >
          <div className="workflow-settings">
            {state.workflow.map((s, index) => (
              <div key={s}>
                <span className={`status-dot tone-${index}`} />
                <b>{s}</b>
                <span>
                  {state.issues.filter((i) => i.status === s).length} issues
                </span>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !newStatus.trim() ||
                  state.workflow.includes(newStatus.trim())
                )
                  return;
                edit({ workflow: [...state.workflow, newStatus.trim()] });
                setNewStatus("");
              }}
            >
              <input
                aria-label="New workflow status"
                placeholder="New status name"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              />
              <Button type="submit">
                <Plus size={15} />
                Add
              </Button>
            </form>
          </div>
        </Panel>
        <Panel
          title="Connected services"
          subtitle="Credentials are configured server-side."
        >
          <div className="integrations">
            {[
              ["Vercel", "Frontend hosting"],
              ["Supabase", "Database, identity and files"],
              ["Resend", "Transactional email"],
              ["Anthropic", "SOW-to-plan generation"],
              ["HubSpot", "Commercial handoff"],
              ["Zoho Books", "Invoice visibility"],
            ].map(([name, desc]) => (
              <div key={name}>
                <span className="integration-logo">{name[0]}</span>
                <div>
                  <b>{name}</b>
                  <small>{desc}</small>
                </div>
                <Badge tone="neutral">Not connected</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="soft-note">
        <LockKeyhole size={16} />
        This build uses browser-local data. Customer preview illustrates sharing
        and is not a security boundary. Production identity, permissions and
        provider connections require the Supabase integration.
      </div>
    </>
  );
}
function DesignSystem() {
  return (
    <>
      <PageHeading
        eyebrow="HELM DESIGN SYSTEM · V1"
        title="Quiet confidence. Clear direction."
        description="A shared visual language for your team and your customers."
      />
      <div className="design-hero">
        <Compass size={54} strokeWidth={1} />
        <h2>helm.</h2>
        <p>Client delivery, together.</p>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Color foundations"
          subtitle="White canvas. Olive for action. Meaningful status."
        >
          <div className="swatches">
            {[
              ["Primary", "#536447"],
              ["Ink", "#202A25"],
              ["Canvas", "#FFFFFF"],
              ["Border", "#E4E7E0"],
              ["Blue", "#386AB5"],
              ["Amber", "#946014"],
            ].map(([label, color]) => (
              <div key={label}>
                <span style={{ background: color }} />
                <b>{label}</b>
                <code>{color}</code>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Typography"
          subtitle="Manrope · Self-hosted · Consistent hierarchy"
        >
          <div className="type-samples">
            <h1>A clear next step.</h1>
            <h2>Made for collaboration.</h2>
            <h3>Every detail in context.</h3>
            <p>
              Readable, calm and direct. Interface copy explains what is
              happening and what comes next.
            </p>
            <small>
              11px metadata · 13px interface · 39px portfolio heading
            </small>
          </div>
        </Panel>
      </div>
      <Panel
        title="Components"
        subtitle="One family, across dense work views and spacious customer journeys."
      >
        <div className="component-samples">
          <div>
            <h3>Actions</h3>
            <Button variant="primary">
              Primary action
              <ArrowRight size={15} />
            </Button>
            <Button>Secondary action</Button>
            <Button disabled>Unavailable</Button>
          </div>
          <div>
            <h3>States</h3>
            <Badge>On track</Badge>
            <Badge>Needs attention</Badge>
            <Badge>In review</Badge>
            <Visibility value="Internal" />
            <Visibility value="Shared" />
          </div>
          <div>
            <h3>People and progress</h3>
            <Avatar id="ar" />
            <Avatar id="rk" />
            <Avatar id="mn" />
            <Progress value={64} />
          </div>
        </div>
      </Panel>
    </>
  );
}
