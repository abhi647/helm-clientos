import test from "node:test";
import assert from "node:assert/strict";
import {
  SEED,
  makeIssue,
  publishDraft,
  localDraft,
  progress,
} from "../src/domain.mjs";
test("publishing requires individual review and PM approval", () => {
  const s = structuredClone(SEED);
  s.drafts.p1 = localDraft(
    "Build the inventory semantic model.\nValidate the financial reconciliation.",
  );
  assert.throws(() => publishDraft(s, "p1"), /Review every/);
  s.drafts.p1.items.forEach((i) => (i.reviewed = true));
  assert.throws(() => publishDraft(s, "p1"), /PM approval/);
});
test("publishing assigns unique IDs, keeps source and is idempotent", () => {
  const s = structuredClone(SEED);
  s.drafts.p1 = localDraft(
    "Build the inventory semantic model.\nValidate the financial reconciliation.",
  );
  s.drafts.p1.items.forEach((i) => (i.reviewed = true));
  s.drafts.p1.pmApproved = true;
  const next = publishDraft(s, "p1");
  assert.equal(next.issues.length, s.issues.length + 2);
  assert.equal(new Set(next.issues.map((i) => i.id)).size, next.issues.length);
  assert.equal(next.drafts.p1.source, s.drafts.p1.source);
  assert.equal(publishDraft(next, "p1"), next);
  assert.equal(s.drafts.p1.published, false);
});
test("issue keys belong to their project and default private", () => {
  const i = makeIssue(SEED, "p2", { title: "New work" });
  assert.equal(i.id, "CBD-102");
  assert.equal(i.visibility, "Internal");
});
test("progress is computed from completed issues in the selected scope", () => {
  assert.equal(progress(SEED.issues, "p1"), 17);
  assert.equal(progress([], "p1"), 0);
});
