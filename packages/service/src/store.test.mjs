import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { CommercialTaskStore, validateCreateTask } from "./store.mjs";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "savc-service-"));

after(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("validateCreateTask rejects missing requirement", () => {
  const result = validateCreateTask({
    projectId: "pj_1",
    taskType: "development_planning",
    input: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 40053);
});

test("CommercialTaskStore can create task, message, and cancel", async () => {
  const store = new CommercialTaskStore(path.join(tempRoot, "case-1"));
  await store.init();

  const task = await store.createTask(
    {
      projectId: "pj_1",
      taskType: "development_planning",
      input: {
        requirement: "build planning",
      },
    },
    "trace_case_1",
  );

  assert.equal(task.projectId, "pj_1");
  assert.equal(task.status, "accepted");

  const message = await store.createMessage(task.taskId, "补充一个支付模块", "text");
  assert.equal(message.status, "accepted");

  const events = await store.getEvents(task.taskId);
  assert.equal(events.total, 2);

  const canceled = await store.cancelTask(task.taskId, "manual_cancel");
  assert.equal(canceled.status, "canceled");
});
