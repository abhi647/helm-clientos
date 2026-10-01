import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Archive, Bell, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleDot, Clock3, Columns3, Command, Filter, Flag,
  Gauge, Inbox, LayoutDashboard, List, LockKeyhole, Menu, MessageSquare,
  MoreHorizontal, Paperclip, Plus, Search, Settings, Share2, Sparkles,
  Users, X, Zap
} from 'lucide-react';
import './styles.css';

const PEOPLE = {
  AR: { name: 'Abhijit', color: '#0f6b5e' },
  RK: { name: 'Rahul', color: '#3357b7' },
  SP: { name: 'Sahil', color: '#7a4bb7' },
  MN: { name: 'Meera', color: '#a54866' },
};

const INITIAL_COLUMNS = [
  { id: 'todo', name: 'To do', tone: 'neutral' },
  { id: 'progress', name: 'In progress', tone: 'blue' },
  { id: 'review', name: 'In review', tone: 'amber' },
  { id: 'done', name: 'Done', tone: 'green' },
];

const INITIAL_ISSUES = [
  { id: '7B-142', type: 'Story', title: 'Map SAP warehouse hierarchy', status: 'progress', priority: 'High', assignee: 'RK', points: 5, due: 'Oct 04', labels: ['data'], visibility: 'Shared', sprint: true, description: 'Validate the source hierarchy and map it to the canonical warehouse dimension.', comments: 6, files: 2 },
  { id: '7B-143', type: 'Task', title: 'Build inventory semantic model', status: 'todo', priority: 'Medium', assignee: 'SP', points: 8, due: 'Oct 07', labels: ['power-bi'], visibility: 'Internal', sprint: true, description: 'Create the governed inventory model and validate core measures.', comments: 2, files: 1 },
  { id: '7B-144', type: 'Bug', title: 'Forecast filter resets on refresh', status: 'review', priority: 'Highest', assignee: 'MN', points: 3, due: 'Today', labels: ['bug'], visibility: 'Shared', sprint: true, description: 'Persist selected region and product filters between sessions.', comments: 9, files: 0 },
  { id: '7B-145', type: 'Story', title: 'Customer UAT workspace', status: 'todo', priority: 'High', assignee: 'AR', points: 5, due: 'Oct 09', labels: ['customer'], visibility: 'Shared', sprint: true, description: 'Prepare the customer-facing UAT view with feedback and sign-off.', comments: 3, files: 3 },
  { id: '7B-146', type: 'Task', title: 'Validate product mappings', status: 'done', priority: 'Medium', assignee: 'RK', points: 3, due: 'Sep 30', labels: ['data'], visibility: 'Internal', sprint: true, description: 'Check unmapped SKUs and confirm fallback rules.', comments: 4, files: 1 },
  { id: '7B-147', type: 'Epic', title: 'Management reporting rollout', status: 'progress', priority: 'High', assignee: 'AR', points: 13, due: 'Oct 18', labels: ['milestone'], visibility: 'Shared', sprint: true, description: 'Coordinate the release of the executive reporting pack.', comments: 12, files: 4 },
  { id: '7B-148', type: 'Story', title: 'Automate weekly data-quality checks', status: 'todo', priority: 'Low', assignee: 'SP', points: 5, due: 'Oct 21', labels: ['automation'], visibility: 'Internal', sprint: false, description: 'Generate exceptions and assign owners every Monday.', comments: 1, files: 0 },
  { id: '7B-149', type: 'Task', title: 'Document report ownership model', status: 'todo', priority: 'Medium', assignee: 'MN', points: 2, due: 'Oct 22', labels: ['governance'], visibility: 'Shared', sprint: false, description: 'Capture owners, approvers, refresh SLAs and escalation paths.', comments: 0, files: 2 },
];

const typeIcon = { Story: '◆', Task: '✓', Bug: '●', Epic: '⚡' };
const typeClass = { Story: 'story', Task: 'task', Bug: 'bug', Epic: 'epic' };

function Avatar({ code, small = false }) {
  const p = PEOPLE[code] || PEOPLE.AR;
  return <span className={`avatar ${small ? 'small' : ''}`} style={{ background: p.color }} title={p.name}>{code}</span>;
}

function IssueType({ type, withText = false }) {
  return <span className={`issue-type ${typeClass[type]}`} title={type}><b>{typeIcon[type]}</b>{withText && type}</span>;
}

function App() {
  const [view, setView] = useState('Board');
  const [issues, setIssues] = useState(INITIAL_ISSUES);
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [assignee, setAssignee] = useState('All');
  const [modal, setModal] = useState(null);
  const [sidebar, setSidebar] = useState(true);

  const visible = useMemo(() => issues.filter(i => {
    const q = query.toLowerCase();
    return (!q || `${i.id} ${i.title} ${i.labels.join(' ')}`.toLowerCase().includes(q)) && (assignee === 'All' || i.assignee === assignee);
  }), [issues, query, assignee]);

  const moveIssue = (id, status) => setIssues(items => items.map(i => i.id === id ? { ...i, status } : i));
  const createIssue = data => {
    const n = Math.max(...issues.map(i => Number(i.id.split('-')[1]))) + 1;
    const issue = { id: `7B-${n}`, status: 'todo', assignee: 'AR', points: 3, due: 'Oct 24', labels: [], visibility: 'Internal', sprint: true, comments: 0, files: 0, description: '', ...data };
    setIssues(i => [issue, ...i]); setSelected(issue); setModal(null);
  };
  const updateSelected = patch => {
    setSelected(s => ({ ...s, ...patch }));
    setIssues(items => items.map(i => i.id === selected.id ? { ...i, ...patch } : i));
  };

  return <div className="app-shell">
    <Topbar onCreate={() => setModal('create')} />
    <div className="workspace">
      <GlobalRail />
      {sidebar && <ProjectSidebar view={view} setView={setView} />}
      <main className="main">
        <ProjectHeader sidebar={sidebar} setSidebar={setSidebar} view={view} onSettings={() => setModal('settings')} />
        <Toolbar query={query} setQuery={setQuery} assignee={assignee} setAssignee={setAssignee} />
        {view === 'Board' && <Board columns={columns} issues={visible.filter(i => i.sprint)} onMove={moveIssue} onSelect={setSelected} onCreate={() => setModal('create')} />}
        {view === 'Backlog' && <Backlog issues={visible} onSelect={setSelected} onMove={moveIssue} />}
        {view === 'List' && <IssueList issues={visible} columns={columns} onSelect={setSelected} />}
        {view === 'Timeline' && <Timeline issues={visible.filter(i => i.sprint)} />}
      </main>
    </div>
    {selected && <IssuePanel issue={selected} columns={columns} onClose={() => setSelected(null)} onUpdate={updateSelected} />}
    {modal === 'create' && <CreateIssue onClose={() => setModal(null)} onCreate={createIssue} />}
    {modal === 'settings' && <WorkflowSettings columns={columns} setColumns={setColumns} onClose={() => setModal(null)} />}
  </div>;
}

function Topbar({ onCreate }) {
  return <header className="topbar">
    <div className="brand"><span className="brand-mark">7B</span><span>Client OS</span></div>
    <button className="top-nav active">Your work</button><button className="top-nav">Projects</button><button className="top-nav">Customers</button><button className="top-nav">Reports</button>
    <div className="top-spacer" />
    <button className="search-command"><Search size={16}/><span>Search</span><kbd>⌘ K</kbd></button>
    <button className="primary" onClick={onCreate}><Plus size={16}/> Create</button>
    <button className="icon-button"><Bell size={18}/></button><button className="icon-button"><Settings size={18}/></button><Avatar code="AR" />
  </header>;
}

function GlobalRail() {
  return <aside className="global-rail">
    <button className="rail-logo">N</button>
    <button className="rail-btn active"><LayoutDashboard size={18}/></button>
    <button className="rail-btn"><Inbox size={18}/></button>
    <button className="rail-btn"><Users size={18}/></button>
    <div className="rail-space" />
    <button className="rail-btn"><Sparkles size={18}/></button>
  </aside>;
}

function ProjectSidebar({ view, setView }) {
  const items = [
    ['Summary', Gauge], ['Board', Columns3], ['Backlog', Archive], ['List', List], ['Timeline', CalendarDays],
  ];
  return <aside className="project-sidebar">
    <div className="project-id"><span className="project-icon">N</span><div><strong>Nesma analytics</strong><small>Software project</small></div></div>
    <nav>{items.map(([label, Icon]) => <button key={label} onClick={() => ['Summary'].includes(label) ? null : setView(label)} className={view === label ? 'active' : ''}><Icon size={17}/>{label}</button>)}</nav>
    <div className="side-label">PLANNING</div>
    <nav><button><Check size={17}/>Issues</button><button><CircleDot size={17}/>Forms</button><button><Zap size={17}/>Automations</button></nav>
    <div className="side-label">PROJECT</div>
    <nav><button><MessageSquare size={17}/>Updates</button><button><Paperclip size={17}/>Documents</button><button><Users size={17}/>Team</button></nav>
  </aside>;
}

function ProjectHeader({ sidebar, setSidebar, view, onSettings }) {
  return <>
    <div className="crumbs">Projects <ChevronRight size={13}/> Nesma analytics <ChevronRight size={13}/> <b>{view}</b></div>
    <div className="page-header">
      <div><div className="eyebrow">NESMA GROUP · INFOR LN INTEGRATION</div><h1><button className="collapse" onClick={() => setSidebar(!sidebar)}>{sidebar ? <ChevronLeft/> : <Menu/>}</button>{view}</h1><p>Sprint 12 · Data foundation and reporting</p></div>
      <div className="header-actions"><div className="avatar-stack"><Avatar code="AR"/><Avatar code="RK"/><Avatar code="SP"/><span>+3</span></div><button className="secondary"><Share2 size={16}/> Share</button><button className="secondary" onClick={onSettings}><Settings size={16}/> Configure</button><button className="icon-button"><MoreHorizontal size={18}/></button></div>
    </div>
  </>;
}

function Toolbar({ query, setQuery, assignee, setAssignee }) {
  return <div className="toolbar">
    <label className="inline-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search issues"/></label>
    <div className="assignees"><button onClick={() => setAssignee('All')} className={assignee === 'All' ? 'selected' : ''}>All</button>{Object.keys(PEOPLE).map(p => <button key={p} onClick={() => setAssignee(p)} className={assignee === p ? 'selected' : ''}><Avatar code={p} small/></button>)}</div>
    <button className="filter-button"><Filter size={15}/> Filter</button><button className="filter-button">Type <ChevronDown size={14}/></button><button className="filter-button">More <ChevronDown size={14}/></button>
    <div className="toolbar-space"/><span className="saved"><Check size={14}/> Changes saved</span>
  </div>;
}

function Board({ columns, issues, onMove, onSelect, onCreate }) {
  return <section className="board">
    {columns.map(col => {
      const cards = issues.filter(i => i.status === col.id);
      const points = cards.reduce((s, i) => s + i.points, 0);
      return <div className="column" key={col.id} onDragOver={e => e.preventDefault()} onDrop={e => onMove(e.dataTransfer.getData('issue'), col.id)}>
        <div className="column-head"><span className={`status-dot ${col.tone}`}/><strong>{col.name}</strong><span className="count">{cards.length}</span><span className="points">{points}</span><MoreHorizontal size={16}/></div>
        <div className="cards">{cards.map(issue => <IssueCard key={issue.id} issue={issue} onSelect={onSelect} />)}
          <button className="add-card" onClick={onCreate}><Plus size={15}/> Create issue</button>
        </div>
      </div>;
    })}
  </section>;
}

function IssueCard({ issue, onSelect }) {
  return <article className="issue-card" draggable onDragStart={e => e.dataTransfer.setData('issue', issue.id)} onClick={() => onSelect(issue)}>
    <div className="card-top"><IssueType type={issue.type}/>{issue.visibility === 'Internal' ? <LockKeyhole size={13}/> : <Users size={13}/>}<button><MoreHorizontal size={16}/></button></div>
    <h3>{issue.title}</h3>
    <div className="labels">{issue.labels.map(l => <span key={l}>{l}</span>)}</div>
    <div className="card-bottom"><span className="issue-key">{issue.id}</span><span className={`priority ${issue.priority.toLowerCase()}`}><Flag size={13}/></span><span className="point-pill">{issue.points}</span><Avatar code={issue.assignee} small/></div>
  </article>;
}

function Backlog({ issues, onSelect, onMove }) {
  const sprint = issues.filter(i => i.sprint), backlog = issues.filter(i => !i.sprint);
  return <div className="backlog"><IssueGroup title="Sprint 12" subtitle={`${sprint.length} issues · ${sprint.reduce((s,i)=>s+i.points,0)} points`} issues={sprint} onSelect={onSelect} action="Complete sprint"/><IssueGroup title="Backlog" subtitle={`${backlog.length} issues`} issues={backlog} onSelect={onSelect} action="Start sprint"/></div>;
}

function IssueGroup({ title, subtitle, issues, onSelect, action }) {
  return <section className="issue-group"><header><ChevronDown size={17}/><div><strong>{title}</strong><small>{subtitle}</small></div><span/><button className="secondary small-button">{action}</button><MoreHorizontal size={17}/></header>
    {issues.map(i => <div className="issue-row" key={i.id} onClick={() => onSelect(i)}><span className="grip">⠿</span><IssueType type={i.type}/><b>{i.id}</b><span className="row-title">{i.title}</span><span className={`priority ${i.priority.toLowerCase()}`}><Flag size={14}/></span><span className="point-pill">{i.points}</span><Avatar code={i.assignee} small/><span className="status-lozenge">{i.status.replace('progress','in progress')}</span></div>)}
  </section>;
}

function IssueList({ issues, columns, onSelect }) {
  return <div className="list-view"><div className="list-header"><span>Type</span><span>Key</span><span>Summary</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due</span></div>{issues.map(i => <div className="list-row" key={i.id} onClick={() => onSelect(i)}><IssueType type={i.type}/><b>{i.id}</b><span>{i.title}</span><span className="status-lozenge">{columns.find(c=>c.id===i.status)?.name}</span><span>{i.priority}</span><span className="person"><Avatar code={i.assignee} small/>{PEOPLE[i.assignee].name}</span><span>{i.due}</span></div>)}</div>;
}

function Timeline({ issues }) {
  return <div className="timeline"><div className="timeline-month"><b>October 2026</b><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>{issues.map((i, idx) => <div className="timeline-row" key={i.id}><div><IssueType type={i.type}/><b>{i.id}</b><span>{i.title}</span></div><div className="timeline-track"><span className={`timeline-bar ${typeClass[i.type]}`} style={{left:`${8 + (idx%4)*12}%`,width:`${20 + i.points*2}%`}}>{i.points} pts</span></div></div>)}</div>;
}

function IssuePanel({ issue, columns, onClose, onUpdate }) {
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><aside className="issue-panel">
    <div className="panel-top"><span><IssueType type={issue.type}/><b>{issue.id}</b></span><div><button className="icon-button"><Share2 size={17}/></button><button className="icon-button"><MoreHorizontal size={17}/></button><button className="icon-button" onClick={onClose}><X size={18}/></button></div></div>
    <div className="panel-body"><div className="issue-main"><input className="title-input" value={issue.title} onChange={e => onUpdate({title:e.target.value})}/><div className="quick-actions"><button><Paperclip size={15}/> Attach</button><button><CircleDot size={15}/> Add child issue</button><button><Zap size={15}/> Link</button></div>
      <h4>Description</h4><textarea value={issue.description} onChange={e => onUpdate({description:e.target.value})} placeholder="Add a description..."/>
      <h4>Child issues <span className="muted">0</span></h4><button className="empty-action"><Plus size={15}/> Add child issue</button>
      <h4>Activity</h4><div className="activity-tabs"><b>All</b><span>Comments</span><span>History</span></div><div className="comment-box"><Avatar code="AR"/><input placeholder="Add a comment…"/></div>
      <div className="activity-item"><Avatar code="RK" small/><p><b>Rahul</b> moved this issue to <span className="status-lozenge">{columns.find(c=>c.id===issue.status)?.name}</span><small>Today at 10:42 AM</small></p></div>
    </div><div className="issue-details"><select value={issue.status} onChange={e => onUpdate({status:e.target.value})}>{columns.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><h4>Details</h4>
      <Detail label="Assignee"><span className="person"><Avatar code={issue.assignee} small/><select value={issue.assignee} onChange={e => onUpdate({assignee:e.target.value})}>{Object.entries(PEOPLE).map(([k,p])=><option value={k} key={k}>{p.name}</option>)}</select></span></Detail>
      <Detail label="Priority"><select value={issue.priority} onChange={e=>onUpdate({priority:e.target.value})}><option>Highest</option><option>High</option><option>Medium</option><option>Low</option></select></Detail><Detail label="Story points"><input type="number" value={issue.points} onChange={e=>onUpdate({points:+e.target.value})}/></Detail><Detail label="Due date"><span>{issue.due}</span></Detail><Detail label="Visibility"><button className="visibility" onClick={()=>onUpdate({visibility:issue.visibility==='Internal'?'Shared':'Internal'})}>{issue.visibility==='Internal'?<LockKeyhole size={14}/>:<Users size={14}/>} {issue.visibility}</button></Detail><Detail label="Customer"><span>Nesma Group</span></Detail>
      <button className="configure-fields"><Settings size={14}/> Configure fields</button>
    </div></div>
  </aside></div>;
}

function Detail({ label, children }) { return <div className="detail"><label>{label}</label>{children}</div> }

function CreateIssue({ onClose, onCreate }) {
  const [title, setTitle] = useState(''); const [type, setType] = useState('Task');
  return <div className="modal-overlay"><div className="modal"><header><h2>Create issue</h2><button className="icon-button" onClick={onClose}><X/></button></header><label>Project<select><option>Nesma analytics (7B)</option></select></label><label>Issue type<select value={type} onChange={e=>setType(e.target.value)}><option>Epic</option><option>Story</option><option>Task</option><option>Bug</option></select></label><label>Summary <b>*</b><input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs to be done?"/></label><label>Description<textarea placeholder="Add context, acceptance criteria, or links…"/></label><label>Visibility<select><option>Internal</option><option>Shared</option></select></label><footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!title} onClick={()=>onCreate({title,type})}>Create</button></footer></div></div>;
}

function WorkflowSettings({ columns, setColumns, onClose }) {
  const add = () => setColumns(c => [...c, {id:`custom-${Date.now()}`,name:'New status',tone:'neutral'}]);
  return <div className="modal-overlay"><div className="modal wide"><header><div><span className="eyebrow">PROJECT SETTINGS</span><h2>Workflow</h2></div><button className="icon-button" onClick={onClose}><X/></button></header><p>Statuses are modular. Rename, reorder, or add steps to match how this project is delivered.</p><div className="workflow-list">{columns.map((c,idx)=><div key={c.id}><span className={`status-dot ${c.tone}`}/><input value={c.name} onChange={e=>setColumns(cols=>cols.map(x=>x.id===c.id?{...x,name:e.target.value}:x))}/><span>{idx===0?'OPEN':idx===columns.length-1?'DONE':'IN PROGRESS'}</span><MoreHorizontal size={17}/></div>)}</div><button className="add-status" onClick={add}><Plus size={16}/> Add status</button><div className="field-note"><Sparkles size={18}/><div><b>Custom fields and issue types</b><p>Each project can inherit a template and extend it without changing other projects.</p></div></div><footer><button className="primary" onClick={onClose}>Save workflow</button></footer></div></div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
