import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { afterEach, expect, it, vi } from "vitest";
import { boardSchema, type Board, type Command } from "../shared/actions";
import { createTeamService } from "../server/service";
import { createBoardStore } from "../server/store";
import { taskAgentId } from "../client/model";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "lyre-teams-"));
  roots.push(root);
  const store = createBoardStore(root);
  const agents = new Map<string, { workspaceId: string; busy: boolean }>([
    ["agent-1", { workspaceId: "ws-1", busy: false }],
    ["agent-2", { workspaceId: "ws-1", busy: false }],
    ["foreign", { workspaceId: "ws-2", busy: false }],
  ]);
  const send = vi.fn(async (_text: string, _options: unknown) => {});
  const stop = vi.fn(async (id: string) => {
    agents.get(id)!.busy = false;
  });
  const paseo = {
    workspaces: {
      ref: (id: string) => ({
        refresh: async () =>
          id === "ws-1"
            ? { id, projectId: "project-1", archivedAt: null, archivingAt: null }
            : null,
      }),
    },
    agents: {
      ref: (id: string) => ({
        refresh: async () =>
          agents.has(id) ? { agent: { id, workspaceId: agents.get(id)!.workspaceId } } : null,
        get activeTurn() {
          return agents.get(id)?.busy ? { turnId: "turn" } : null;
        },
        get status() {
          return agents.get(id)?.busy ? "running" : "idle";
        },
        send: (text: string, options: unknown) => send(text, options),
        stop: () => stop(id),
      }),
    },
  } as unknown as PaseoApi;
  let sequence = 0;
  const service = createTeamService(store, () => `id-${++sequence}`);
  let board = await service.read("ws-1", paseo);
  const change = async (command: Command) => {
    board = await service.change("ws-1", board.revision, command, paseo);
    return board;
  };
  const member = async (agentId = "agent-1") => {
    await change({ kind: "addMember", name: agentId, role: "Implement", agentId, parentId: null });
    return board.members.at(-1)!.id;
  };
  const task = async (memberId: string | null, dependencies: string[] = []) => {
    await change({
      kind: "addTask",
      title: "Fix navigation",
      description: "Preserve drafts",
      memberId,
      dependencies,
      criteria: ["Check compact layout"],
    });
    return board.tasks.at(-1)!.id;
  };
  return {
    root,
    store,
    service,
    paseo,
    send,
    stop,
    agents,
    change,
    member,
    task,
    board: () => board,
  };
}
it("persists a team across a restart without replaying an uncertain prompt", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  await s.change({ kind: "start", taskId });
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(s.board().tasks[0].delivery).toBe("submitted");
  await s.service.dispose();
  const restored = await createTeamService(s.store).read("ws-1", s.paseo);
  expect(restored.tasks[0].status).toBe("unknown");
  expect(restored.tasks[0].delivery).toBe("unknown");
  expect(s.send).toHaveBeenCalledTimes(1);
});
it("enforces worker capacity and rejects stale revisions before effects", async () => {
  const s = await setup();
  const first = await s.task(await s.member());
  const second = await s.task(await s.member("agent-2"));
  await s.change({ kind: "start", taskId: first });
  await expect(s.change({ kind: "start", taskId: second })).rejects.toThrow("TEAMS_CAPACITY");
  await expect(
    s.service.change(
      "ws-1",
      0,
      { kind: "configure", name: "Team", paused: false, maxWorkers: 2 },
      s.paseo,
    ),
  ).rejects.toThrow("TEAMS_CONFLICT");
  expect(s.send).toHaveBeenCalledTimes(1);
});
it("refuses foreign workspace conversations, unknown dependencies and busy agents", async () => {
  const s = await setup();
  await expect(s.member("foreign")).rejects.toThrow("TEAMS_SCOPE_DENIED");
  await expect(s.task(null, ["missing"])).rejects.toThrow("TEAMS_TASK_MISSING");
  const taskId = await s.task(await s.member());
  s.agents.get("agent-1")!.busy = true;
  await expect(s.change({ kind: "start", taskId })).rejects.toThrow("TEAMS_BUSY");
  expect(s.send).not.toHaveBeenCalled();
});
it("honors pause and accepted dependencies", async () => {
  const s = await setup();
  const first = await s.task(await s.member());
  const next = await s.task(s.board().members[0].id, [first]);
  await expect(s.change({ kind: "start", taskId: next })).rejects.toThrow("TEAMS_DEPENDENCY");
  await s.change({ kind: "configure", name: "Team", paused: true, maxWorkers: 1 });
  await expect(s.change({ kind: "start", taskId: first })).rejects.toThrow("TEAMS_PAUSED");
});
it("records unknown submission without retrying and refuses retry while the old turn is active", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  s.send.mockRejectedValueOnce(new Error("Lost connection"));
  await s.change({ kind: "start", taskId });
  expect(s.board().tasks[0].status).toBe("unknown");
  s.agents.get("agent-1")!.busy = true;
  await expect(s.change({ kind: "retry", taskId })).rejects.toThrow("TEAMS_BUSY");
  expect(s.send).toHaveBeenCalledTimes(1);
});
it("correlates completed turns with the exact task attempt and keeps human checks unchecked", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  await s.change({ kind: "start", taskId });
  const event = {
    agent: {
      id: "agent-1",
      workspaceId: "ws-1",
      parentAgentId: null,
      provider: "claude",
      cwd: "unused",
      title: "Member",
    },
    turnId: "turn",
    outcome: { kind: "completed" as const },
    timeline: [
      {
        type: "user_message" as const,
        text: "Another manual turn",
        clientMessageId: `lyre-teams-${taskId}-1`,
      },
      { type: "assistant_message" as const, text: "Done" },
    ],
  };
  await s.service.ended(event);
  expect((await s.store.read("ws-1", "project-1")).tasks[0].status).toBe("working");
  event.timeline[0].text = `[Lyre Teams ${taskId} attempt 1]\nTask`;
  await s.service.ended(event);
  const fresh = await s.service.read("ws-1", s.paseo);
  expect(fresh.tasks[0].status).toBe("review");
  expect(fresh.tasks[0].delivery).toBe("observed");
  expect(fresh.tasks[0].criteria[0].status).toBe("not-checked");
  const accepted = await s.service.change(
    "ws-1",
    fresh.revision,
    { kind: "accept", taskId },
    s.paseo,
  );
  expect(accepted.tasks[0].criteria[0].status).toBe("not-checked");
});
it("ignores historical assignment prompts and records only the current assignment reply", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  await s.change({ kind: "start", taskId });
  const prompt = {
    type: "user_message" as const,
    text: `[Lyre Teams ${taskId} attempt 1]\nTask`,
    clientMessageId: `lyre-teams-${taskId}-1`,
  };
  const event = {
    agent: {
      id: "agent-1",
      workspaceId: "ws-1",
      parentAgentId: null,
      provider: "claude",
      cwd: "unused",
      title: "Member",
    },
    turnId: "turn",
    outcome: { kind: "completed" as const },
    timeline: [
      prompt,
      { type: "assistant_message" as const, text: "Old result" },
      { ...prompt, text: "Later manual request", clientMessageId: "manual" },
      { type: "assistant_message" as const, text: "Manual reply" },
    ],
  };
  await s.service.ended(event);
  expect((await s.store.read("ws-1", "project-1")).tasks[0].status).toBe("working");
  event.timeline = [
    { type: "assistant_message", text: "Earlier conversation reply" },
    prompt,
    { type: "assistant_message", text: "Current assignment reply" },
  ];
  await s.service.ended(event);
  const reviewed = await s.service.read("ws-1", s.paseo);
  expect(reviewed.tasks[0].result).toBe("Current assignment reply");
  const retried = await s.service.change(
    "ws-1",
    reviewed.revision,
    { kind: "retry", taskId },
    s.paseo,
  );
  expect(retried.tasks[0].history[0].result).toBe("Current assignment reply");
  expect(retried.tasks[0].history[0].criteria[0].status).toBe("not-checked");
  expect(retried.tasks[0].result).toBe("");
});
it("uses host Stop, preserves records and requires evidence when marking a check passed", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  await s.change({ kind: "start", taskId });
  await s.change({ kind: "cancel", taskId });
  expect(s.stop).toHaveBeenCalledWith("agent-1");
  expect(s.board().tasks[0].status).toBe("canceled");
  await s.change({ kind: "review", taskId, result: "Reviewed conversation" });
  const criterionId = s.board().tasks[0].criteria[0].id;
  await expect(
    s.change({ kind: "criterion", taskId, criterionId, status: "passed", evidence: "" }),
  ).rejects.toThrow("TEAMS_EVIDENCE");
});
it("opens the current owner for a reassigned planned task and retains the previous attempt conversation", async () => {
  const s = await setup();
  const taskId = await s.task(await s.member());
  await s.change({ kind: "start", taskId });
  await s.change({ kind: "cancel", taskId });
  expect(taskAgentId(s.board(), s.board().tasks[0])).toBe("agent-1");
  await s.change({ kind: "retry", taskId });
  await s.change({ kind: "assign", taskId, memberId: await s.member("agent-2") });
  expect(taskAgentId(s.board(), s.board().tasks[0])).toBe("agent-2");
  expect(s.board().tasks[0].history[0].agentId).toBe("agent-1");
});
it("hashes untrusted workspace IDs and fails closed on unsupported data or project identity", async () => {
  const s = await setup();
  const board: Board = { ...s.board(), workspaceId: "../../escape" };
  await s.store.write(board);
  const files = await readdir(s.root);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
  await expect(s.store.read("../../escape", "foreign")).rejects.toThrow("TEAMS_SCOPE_DENIED");
  const file = path.join(s.root, files[0]);
  const saved = JSON.parse(await readFile(file, "utf8"));
  saved.version = 2;
  await writeFile(file, JSON.stringify(saved));
  await expect(s.store.read("../../escape", "project-1")).rejects.toThrow("TEAMS_DATA_VERSION");
  expect(boardSchema.safeParse({ ...board, maxWorkers: 0 }).success).toBe(false);
});
