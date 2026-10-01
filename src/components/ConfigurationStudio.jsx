"use client";
import { useState } from "react";
import {
  Plus,
  SlidersHorizontal,
  LockKeyhole,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Button, Panel, Field, Badge } from "./ui";

export default function ConfigurationStudio({
  state,
  setState,
  setNotice,
  children,
}) {
  const [tab, setTab] = useState("Work fields"),
    [name, setName] = useState(""),
    [type, setType] = useState("text"),
    [visibility, setVisibility] = useState("Internal");
  const change = (id, patch) =>
    setState((s) => ({
      ...s,
      fieldDefinitions: s.fieldDefinitions.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    }));
  return (
    <div className="configuration-studio">
      <div className="delivery-title">
        <div>
          <span className="section-kicker">
            ADMINISTRATION / LOCAL CONFIGURATION
          </span>
          <h1>Workspace configuration</h1>
          <p>
            Configure the work model without replacing its history. Cloud access
            policies remain a separate production gate.
          </p>
        </div>
      </div>
      <div className="configuration-tabs">
        {["Work fields", "Workflow & integrations"].map((label) => (
          <button
            key={label}
            className={tab === label ? "active" : ""}
            onClick={() => setTab(label)}
          >
            {label === "Work fields" ? (
              <SlidersHorizontal size={15} />
            ) : (
              <Workflow size={15} />
            )}{" "}
            {label}
          </button>
        ))}
      </div>
      {tab === "Work fields" ? (
        <>
          <Panel
            title="Issue field definitions"
            subtitle="These definitions render in work-item details and validate completion requirements."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Audience</th>
                    <th>Completion requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {state.fieldDefinitions.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <b>{f.name}</b>
                        <small className="table-subline">{f.id}</small>
                      </td>
                      <td>
                        <Badge>{f.type}</Badge>
                      </td>
                      <td>
                        <select
                          aria-label={`Audience for ${f.name}`}
                          value={f.visibility}
                          onChange={(e) =>
                            change(f.id, { visibility: e.target.value })
                          }
                        >
                          <option>Internal</option>
                          <option>Shared</option>
                        </select>
                      </td>
                      <td>
                        <label className="config-check">
                          <input
                            type="checkbox"
                            checked={f.requiredOnDone}
                            onChange={(e) =>
                              change(f.id, { requiredOnDone: e.target.checked })
                            }
                          />
                          Required before Done
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Add a work field"
            subtitle="Stable identifiers preserve values when display names change."
          >
            <form
              className="field-definition-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                setState((s) => ({
                  ...s,
                  fieldDefinitions: [
                    ...s.fieldDefinitions,
                    {
                      id: crypto.randomUUID(),
                      name: name.trim(),
                      type,
                      visibility,
                      requiredOnDone: false,
                    },
                  ],
                }));
                setName("");
                setNotice("Custom field added to issue details.");
              }}
            >
              <Field label="Field label">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Deployment environment"
                />
              </Field>
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </Field>
              <Field label="Audience">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option>Internal</option>
                  <option>Shared</option>
                </select>
              </Field>
              <Button variant="primary" type="submit">
                <Plus size={14} />
                Add field
              </Button>
            </form>
          </Panel>
          <div className="context-card">
            <ShieldCheck size={20} />
            <div>
              <b>Configuration has consequences</b>
              <p>
                Required fields apply to every project in this local workspace.
                Project-specific versioned schemes and migration previews remain
                production work.
              </p>
            </div>
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
