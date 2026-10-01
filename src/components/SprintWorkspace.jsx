"use client";
import { useState } from "react";
import { Play, CheckCheck, CalendarDays, Flag } from "lucide-react";
import { Button, Field, Badge } from "./ui";
import {
  startSprint,
  completeSprint,
  SCENARIO_DATE,
} from "../delivery-domain.mjs";

export default function SprintWorkspace({
  state,
  setState,
  project,
  setNotice,
}) {
  const [data, setData] = useState({
    name: "Delivery sprint",
    goal: "",
    start: SCENARIO_DATE,
    end: "2026-10-14",
  });
  const active = state.sprints.find(
    (s) => s.project === project.id && s.status === "Active",
  );
  const current = state.issues.filter(
    (i) =>
      i.project === project.id && i.sprint && (active || i.status !== "Done"),
  );
  const histories = state.sprints.filter(
    (s) => s.project === project.id && s.status === "Complete",
  );
  const run = (fn, message) => {
    try {
      setState(fn(state));
      setNotice(message);
    } catch (error) {
      setNotice(error.message);
    }
  };
  return (
    <section className="sprint-workspace">
      <header>
        <span className="section-kicker">SPRINT CONTROL</span>
        <Badge tone={active ? "green" : "neutral"}>
          {active ? "Active sprint" : "Planning"}
        </Badge>
      </header>
      {active ? (
        <>
          <div className="sprint-title">
            <div>
              <h2>{active.name}</h2>
              <p>{active.goal || "No goal recorded."}</p>
              <small>
                {active.start} → {active.end}
              </small>
            </div>
            <Button
              onClick={() =>
                run(
                  (s) => completeSprint(s, active.id),
                  "Sprint completed. Unfinished work returned to backlog; completion snapshot retained.",
                )
              }
            >
              <CheckCheck size={15} />
              Complete & return unfinished work
            </Button>
          </div>
          <div className="sprint-summary">
            <span>{active.baseline.length} items at start</span>
            <span>{current.length} currently included</span>
            <span>
              {current.reduce((n, i) => n + i.points, 0)} story points in scope
            </span>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (s) => startSprint(s, project.id, data),
              "Sprint started with an immutable scope baseline.",
            );
          }}
        >
          <div className="sprint-fields">
            <Field label="Sprint name">
              <input
                required
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </Field>
            <Field label="Sprint goal">
              <input
                value={data.goal}
                onChange={(e) => setData({ ...data, goal: e.target.value })}
              />
            </Field>
            <Field label="Start">
              <input
                type="date"
                required
                value={data.start}
                onChange={(e) => setData({ ...data, start: e.target.value })}
              />
            </Field>
            <Field label="End">
              <input
                type="date"
                required
                value={data.end}
                onChange={(e) => setData({ ...data, end: e.target.value })}
              />
            </Field>
          </div>
          <div className="sprint-title">
            <small>
              {current.length} items selected · Use the list below to move items
              into the sprint.
            </small>
            <Button type="submit" variant="primary">
              <Play size={14} />
              Start sprint
            </Button>
          </div>
        </form>
      )}
      {histories.length > 0 && (
        <details className="sprint-history">
          <summary>{histories.length} completed sprint snapshots</summary>
          {histories.map((s) => (
            <div key={s.id}>
              <b>{s.name}</b>
              <span>
                {s.baseline.length} planned →{" "}
                {s.completion.filter((i) => i.status === "Done").length}{" "}
                completed of {s.completion.length} final scope
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
