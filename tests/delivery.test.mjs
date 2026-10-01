import test from "node:test";
import assert from "node:assert/strict";
import { SEED } from "../src/domain.mjs";
import {
  upgradeDelivery,
  finishMilestone,
  defectFromTest,
  signOff,
  createMeetingAction,
  transitionTime,
  instantiateTemplate,
  estimateRequest,
  requestToWork,
  createRequest,
  validateIssuePatch,
  createHandoffProject,
  startSprint,
  completeSprint,
  decideApproval,
} from "../src/delivery-domain.mjs";
test("approval decisions freeze a round and update the linked request", () => {
  let s = estimateRequest(seed(), "REQ-101", {
    scope: "Scope",
    criteria: "Criteria",
    hours: 8,
  });
  const id = s.requests[0].approval;
  s = decideApproval(s, id, "Approved");
  assert.equal(s.requests[0].status, "Approved");
  assert.equal(decideApproval(s, id, "Approved"), s);
  assert.throws(
    () => decideApproval(s, id, "Changes requested", "Change"),
    /frozen/,
  );
});
const seed = () => upgradeDelivery(structuredClone(SEED));
test("delivery upgrade preserves existing local data and is repeatable", () => {
  const s = seed();
  s.risks.push({ id: "custom" });
  assert.equal(upgradeDelivery(s).risks.length, s.risks.length);
  assert.deepEqual(upgradeDelivery(s), s);
});
test("milestone completion enforces linked work and approval", () => {
  const s = seed();
  assert.throws(() => finishMilestone(s, "ms2"), /still open/);
  s.issues = s.issues.map((i) =>
    ["NES-102", "NES-103", "NES-104"].includes(i.id)
      ? { ...i, status: "Done" }
      : i,
  );
  assert.throws(() => finishMilestone(s, "ms2"), /approval/);
  s.approvals[0].status = "Approved";
  const n = finishMilestone(s, "ms2");
  assert.equal(n.milestones.find((m) => m.id === "ms2").status, "Complete");
  assert.equal(finishMilestone(n, "ms2"), n);
});
test("failed test creates one linked defect and blocks sign-off until resolved", () => {
  const s = seed();
  s.tests[0].status = "Failed";
  const n = defectFromTest(s, "test1");
  assert.equal(n.issues.length, s.issues.length + 1);
  assert.equal(defectFromTest(n, "test1"), n);
  n.tests.forEach((t) => (t.status = "Passed"));
  assert.throws(() => signOff(n, "p1"), /linked defects/);
  n.issues.find((i) => i.id === n.tests[0].defect).status = "Done";
  const signed = signOff(n, "p1");
  assert.equal(signed.signoffs.length, 1);
  assert.equal(signOff(signed, "p1"), signed);
  n.tests[0].title = "Changed";
  assert.notEqual(signed.signoffs[0].cases[0].title, "Changed");
});
test("UAT sign-off rejects incomplete acceptance", () => {
  assert.throws(() => signOff(seed(), "p1"), /must pass/);
});
test("meeting follow-up creates one issue with source context", () => {
  const s = seed();
  const n = createMeetingAction(s, "meet1");
  assert.equal(n.issues.at(-1).sourceMeeting, "meet1");
  assert.equal(createMeetingAction(n, "meet1"), n);
});
test("approved time cannot return to draft", () => {
  const s = seed();
  assert.throws(() => transitionTime(s, "tm2", "Draft"), /immutable/);
  const n = transitionTime(s, "tm1", "Approved");
  assert.equal(n.timeEntries.find((t) => t.id === "tm1").status, "Approved");
});
test("template creates uniquely keyed internal issues and unscheduled milestones", () => {
  const s = seed(),
    result = instantiateTemplate(s, "bi", {
      name: "Validation BI",
      key: "VBI",
      customer: "cbd",
    });
  const issues = result.state.issues.filter(
    (i) => i.project === result.project.id,
  );
  assert.equal(issues.length, 6);
  assert.ok(issues.every((i) => i.visibility === "Internal"));
  assert.ok(
    result.state.milestones
      .filter((m) => m.project === result.project.id)
      .every((m) => m.due === ""),
  );
  assert.throws(
    () =>
      instantiateTemplate(result.state, "bi", {
        name: "Duplicate",
        key: "VBI",
        customer: "cbd",
      }),
    /unique/,
  );
});
test("estimate approval is version-specific and conversion is idempotent", () => {
  let s = estimateRequest(seed(), "REQ-101", {
    scope: "Forecast by region",
    criteria: "Totals match source",
    hours: 12,
  });
  assert.throws(() => requestToWork(s, "REQ-101"), /Approve/);
  s.approvals.find((a) => a.request === "REQ-101").status = "Approved";
  const n = requestToWork(s, "REQ-101");
  assert.equal(n.issues.at(-1).sourceRequest, "REQ-101");
  assert.equal(requestToWork(n, "REQ-101"), n);
  s = estimateRequest(s, "REQ-101", {
    scope: "Changed scope",
    criteria: "New acceptance",
    hours: 16,
  });
  assert.throws(() => requestToWork(s, "REQ-101"), /Approve/);
});
test("new estimate supersedes an outstanding approval", () => {
  let s = estimateRequest(seed(), "REQ-101", {
    scope: "Scope",
    criteria: "Criteria",
    hours: 8,
  });
  const first = s.requests[0].approval;
  s = estimateRequest(s, "REQ-101", {
    scope: "Scope v2",
    criteria: "Criteria v2",
    hours: 9,
  });
  assert.equal(s.approvals.find((a) => a.id === first).status, "Superseded");
  assert.equal(s.requests[0].estimateVersion, 2);
});
test("enabled local request rule assigns the project lead", () => {
  let s = seed();
  s.rules[0].enabled = true;
  s = createRequest(s, { project: "p1", title: "New request" });
  assert.equal(s.requests[0].owner, "rk");
  assert.equal(s.audit[0].event, "request.created");
});
test("issue hierarchy and dependencies reject cycles and cross-project links", () => {
  const s = seed(),
    issue = s.issues.find((i) => i.id === "NES-102");
  assert.throws(
    () => validateIssuePatch(s, issue, { parent: "CBD-101" }),
    /same project/,
  );
  s.issues.find((i) => i.id === "NES-103").dependencies = ["NES-102"];
  assert.throws(
    () => validateIssuePatch(s, issue, { dependencies: ["NES-103"] }),
    /cycle/,
  );
  s.issues.find((i) => i.id === "NES-103").parent = "NES-102";
  assert.throws(
    () => validateIssuePatch(s, issue, { parent: "NES-103" }),
    /cycle/,
  );
});
test("Done validates blocking work and required custom fields", () => {
  const s = seed(),
    issue = s.issues[1];
  issue.dependencies = ["NES-103"];
  assert.throws(
    () => validateIssuePatch(s, issue, { status: "Done" }),
    /blocking/,
  );
  issue.dependencies = [];
  s.fieldDefinitions[0].requiredOnDone = true;
  assert.throws(
    () => validateIssuePatch(s, issue, { status: "Done" }),
    /Business outcome/,
  );
  assert.equal(
    validateIssuePatch(s, issue, {
      status: "Done",
      customFields: { businessOutcome: "Inventory decisions" },
    }),
    true,
  );
});
test("handoff creates exactly one linked project on replay", () => {
  const s = seed(),
    n = createHandoffProject(s, "deal-demo-cbd-2", { key: "FIN" });
  assert.equal(n.state.projects.length, s.projects.length + 1);
  const replay = createHandoffProject(n.state, "deal-demo-cbd-2", {
    key: "OTHER",
  });
  assert.equal(replay.state, n.state);
  assert.equal(replay.project.id, n.project.id);
});
test("sprint captures baseline and completion without rewriting history", () => {
  const s = seed(),
    n = startSprint(s, "p1", {
      name: "Sprint 1",
      start: "2026-10-01",
      end: "2026-10-14",
      goal: "Validate model",
    });
  assert.throws(
    () =>
      startSprint(n, "p1", {
        name: "Duplicate",
        start: "2026-10-01",
        end: "2026-10-14",
      }),
    /active sprint/,
  );
  n.issues.find((i) => i.id === "NES-102").status = "Done";
  assert.equal(
    n.sprints[0].baseline.find((i) => i.id === "NES-102").status,
    "In progress",
  );
  const done = completeSprint(n, n.sprints[0].id);
  assert.equal(done.sprints[0].status, "Complete");
  assert.ok(
    done.issues.filter((i) => i.project === "p1").every((i) => !i.sprint),
  );
  assert.equal(
    done.sprints[0].completion.find((i) => i.id === "NES-102").status,
    "Done",
  );
});
