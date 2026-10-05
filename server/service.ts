import { randomUUID } from "node:crypto";
import type { PluginHandlerContext, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import type { Board, Command, Task } from "../shared/actions";
import type { BoardStore } from "./store";
type PaseoApi = PluginHandlerContext["paseo"];

function fail(code: string, message: string): never {
  throw new Error(`TEAMS_${code}: ${message}`);
}
const active = (task: Task) => task.status === "working" || task.status === "unknown";
const marker = (task: Task) => `[Lyre Teams ${task.id} attempt ${task.attempt}]`;
const messageId = (task: Task) => `lyre-teams-${task.id}-${task.attempt}`;

export function createTeamService(store: BoardStore, newId: () => string = randomUUID) {
  let tail: Promise<unknown> = Promise.resolve();
  let disposed = false;
  const touched = new Map<string, string>();
  const restored = new Set<string>();
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(() => {
      if (disposed) fail("UNAVAILABLE", "The extension has stopped.");
      return operation();
    });
    tail = next.catch(() => {});
    return next;
  };
  const selected = async (workspaceId: string, paseo: PaseoApi) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace || workspace.archivingAt) fail("SCOPE_DENIED", "Select an active workspace.");
    if (!touched.has(workspaceId) && touched.size >= 100)
      fail("LIMIT", "This session has opened 100 teams. Restart the extension to open another.");
    touched.set(workspaceId, workspace.projectId);
    const board = await store.read(workspaceId, workspace.projectId);
    if (!restored.has(workspaceId)) {
      restored.add(workspaceId);
      let changed = false;
      for (const task of board.tasks) {
        if (active(task)) {
          task.status = "unknown";
          task.delivery = "unknown";
          task.error =
            "The extension restarted. Inspect the conversation before retrying; work may still be running.";
          changed = true;
        }
      }
      if (changed) {
        board.revision++;
        await store.write(board);
      }
    }
    return board;
  };
  const linked = async (board: Board, agentId: string, paseo: PaseoApi) => {
    const agent = paseo.agents.ref(agentId);
    const snapshot = await agent.refresh();
    if (!snapshot || snapshot.agent.workspaceId !== board.workspaceId || snapshot.agent.archivedAt)
      fail("SCOPE_DENIED", "Choose an active conversation in this workspace.");
    return agent;
  };
  const save = async (board: Board) => {
    board.revision++;
    await store.write(board);
    return structuredClone(board);
  };
  const taskFor = (board: Board, id: string) =>
    board.tasks.find((task) => task.id === id) ??
    fail("TASK_MISSING", "Refresh to find this task.");
  const memberFor = (board: Board, id: string) =>
    board.members.find((value) => value.id === id) ??
    fail("MEMBER_MISSING", "Select a member of this team.");
  const changeRoster = async (board: Board, command: Command, paseo: PaseoApi) => {
    const member = (id: string) => memberFor(board, id);
    switch (command.kind) {
      case "configure":
        if (command.maxWorkers < board.tasks.filter(active).length)
          fail("BUSY", "Finish or stop active work before lowering the limit.");
        Object.assign(board, {
          name: command.name,
          paused: command.paused,
          maxWorkers: command.maxWorkers,
        });
        break;
      case "addMember":
        if (board.members.length >= 20) fail("LIMIT", "This team has 20 members.");
        if (board.members.some((value) => value.agentId === command.agentId))
          fail("DUPLICATE", "This conversation is already in the team.");
        if (command.parentId) member(command.parentId);
        await linked(board, command.agentId, paseo);
        board.members.push({
          id: newId(),
          name: command.name,
          role: command.role,
          agentId: command.agentId,
          parentId: command.parentId,
        });
        break;
      case "removeMember":
        member(command.memberId);
        if (board.tasks.some((value) => active(value) && value.memberId === command.memberId))
          fail("BUSY", "Stop this member's active task first.");
        board.members = board.members.filter((value) => value.id !== command.memberId);
        board.members.forEach((value) => {
          if (value.parentId === command.memberId) value.parentId = null;
        });
        board.tasks.forEach((value) => {
          if (value.memberId === command.memberId) value.memberId = null;
        });
        break;
      case "addTask":
        if (board.tasks.length >= 100) fail("LIMIT", "This workspace has 100 retained tasks.");
        if (command.memberId) member(command.memberId);
        command.dependencies.forEach((id) => taskFor(board, id));
        board.tasks.push({
          id: newId(),
          title: command.title,
          description: command.description,
          memberId: command.memberId,
          dependencies: [...new Set(command.dependencies)],
          criteria: command.criteria.map((text) => ({
            id: newId(),
            text,
            status: "not-checked",
            evidence: "",
          })),
          status: "planned",
          attempt: 0,
          agentId: null,
          delivery: "none",
          question: "",
          answer: "",
          result: "",
          error: "",
          history: [],
        });
        break;
      default:
        return;
    }
  };
  const recordTask = (board: Board, task: Task, command: Command) => {
    const member = (id: string) => memberFor(board, id);
    switch (command.kind) {
      case "assign":
        if (active(task)) fail("BUSY", "Stop this task before changing its owner.");
        task.memberId = member(command.memberId).id;
        break;
      case "accept":
        if (task.status !== "review") fail("STATE", "Review this result first.");
        task.status = "accepted";
        break;
      case "question":
        task.question = command.question;
        task.answer = "";
        break;
      case "answer":
        task.answer = command.answer;
        break;
      case "criterion": {
        if (task.status !== "review") fail("STATE", "Record checks during review.");
        const criterion =
          task.criteria.find((value) => value.id === command.criterionId) ??
          fail("CRITERION_MISSING", "Refresh this task.");
        if (command.status !== "not-checked" && !command.evidence.trim())
          fail("EVIDENCE", "Describe the evidence for this check.");
        criterion.status = command.status;
        criterion.evidence = command.evidence;
        break;
      }
      default:
        return;
    }
  };
  const startTask = async (board: Board, task: Task, paseo: PaseoApi) => {
    const member = (id: string) => memberFor(board, id);

    if (board.paused) fail("PAUSED", "Resume the team before starting work.");
    if (task.status !== "planned") fail("STATE", "Only a planned task can start.");
    if (!task.memberId) fail("UNASSIGNED", "Assign this task first.");
    if (task.dependencies.some((id) => taskFor(board, id).status !== "accepted"))
      fail("DEPENDENCY", "Accept this task's dependencies first.");
    if (board.tasks.filter(active).length >= board.maxWorkers)
      fail("CAPACITY", "Finish or stop a task to free a worker slot.");
    const owner = member(task.memberId!);
    if (board.tasks.some((value) => active(value) && value.agentId === owner.agentId))
      fail("BUSY", "This member already has active work.");
    const agent = await linked(board, owner.agentId, paseo);
    if (agent.activeTurn || agent.status === "running")
      fail("BUSY", "This conversation is working. Open it before assigning more work.");
    task.attempt++;
    task.agentId = owner.agentId;
    task.status = "working";
    task.delivery = "submitting";
    task.error = "";
    await save(board); // Record intent before any external effect. Never replay it on restart.
    const prompt = `${marker(task)}\nRole: ${owner.role}\nTask: ${task.title}\n${task.description}\nAcceptance criteria:\n${task.criteria.map((value) => `- ${value.text}`).join("\n")}\nRecorded decision: ${task.answer || "None"}\nWork within this workspace's existing permissions. Report the result and the checks you actually ran. Ask for decisions in this conversation. Do not create helpers for this assignment; the owner manages this team's roster.`;
    try {
      await agent.send(prompt, {
        messageId: messageId(task),
      });
      task.delivery = "submitted";
    } catch {
      task.status = "unknown";
      task.delivery = "unknown";
      task.error = "Submission could not be confirmed. Inspect the conversation before retrying.";
    }
  };
  const cancelTask = async (board: Board, task: Task, paseo: PaseoApi) => {
    if (!active(task) || !task.agentId) fail("STATE", "This task has no active attempt.");
    const agent = await linked(board, task.agentId, paseo);
    await agent.stop();
    await agent.refresh();
    if (agent.activeTurn || agent.status === "running")
      fail("BUSY", "Stop was requested. Wait for the conversation to finish before retrying.");
    task.status = "canceled";
  };
  const reviewTask = async (
    board: Board,
    task: Task,
    command: Extract<Command, { kind: "review" }>,
    paseo: PaseoApi,
  ) => {
    if (!task.agentId) fail("STATE", "Start an assignment before reviewing its result.");
    const agent = await linked(board, task.agentId, paseo);
    if (agent.activeTurn || agent.status === "running")
      fail("BUSY", "Wait for the conversation to finish before reviewing.");
    if (task.status === "accepted" || task.status === "planned")
      fail("STATE", "This task is not ready for review.");
    task.result = command.result;
    task.status = "review";
  };
  const retryTask = async (board: Board, task: Task, paseo: PaseoApi) => {
    if (!["review", "failed", "canceled", "unknown"].includes(task.status))
      fail("STATE", "This task cannot be retried yet.");
    if (task.agentId) {
      const agent = await linked(board, task.agentId, paseo);
      if (agent.activeTurn || agent.status === "running")
        fail("BUSY", "Inspect and stop the previous attempt before retrying.");
    }
    if (task.history.length >= 30)
      fail(
        "LIMIT",
        "This task has 30 retained attempts. Create a new task to continue without deleting evidence.",
      );
    if (task.attempt > 0)
      task.history.push({
        attempt: task.attempt,
        agentId: task.agentId,
        status: task.status,
        delivery: task.delivery,
        result: task.result,
        error: task.error,
        criteria: structuredClone(task.criteria),
        question: task.question,
        answer: task.answer,
      });
    task.status = "planned";
    task.delivery = "none";
    task.error = "";
    task.result = "";
    task.criteria.forEach((value) => {
      value.status = "not-checked";
      value.evidence = "";
    });
  };
  return {
    read: (workspaceId: string, paseo: PaseoApi) =>
      exclusive(async () => structuredClone(await selected(workspaceId, paseo))),
    change: (workspaceId: string, revision: number, command: Command, paseo: PaseoApi) =>
      exclusive(async () => {
        const board = await selected(workspaceId, paseo);
        if (board.revision !== revision)
          fail("CONFLICT", "This team changed. Refresh before saving your draft.");
        const task = "taskId" in command ? taskFor(board, command.taskId) : null;
        switch (command.kind) {
          case "configure":
          case "addMember":
          case "removeMember":
          case "addTask":
            await changeRoster(board, command, paseo);
            break;
          case "start":
            await startTask(board, task!, paseo);
            break;
          case "cancel":
            await cancelTask(board, task!, paseo);
            break;
          case "review":
            await reviewTask(board, task!, command, paseo);
            break;
          case "retry":
            await retryTask(board, task!, paseo);
            break;
          default:
            recordTask(board, task!, command);
        }
        return save(board);
      }),
    ended: (event: PluginLifecycleEvents["agent.turn_ended"]) =>
      exclusive(async () => {
        if (!event.agent.workspaceId) return;
        const projectId = touched.get(event.agent.workspaceId);
        if (!projectId) return;
        const board = await store.read(event.agent.workspaceId, projectId);
        const promptIndex = event.timeline.findLastIndex((item) => item.type === "user_message");
        const prompt = event.timeline[promptIndex];
        const task = board.tasks.find(
          (value) =>
            active(value) &&
            value.agentId === event.agent.id &&
            prompt?.type === "user_message" &&
            prompt.clientMessageId === messageId(value) &&
            prompt.text.startsWith(marker(value)),
        );
        if (!task) return; // Never attribute unrelated manual turns to a team assignment.
        task.delivery = "observed";
        task.status = "failed";
        if (event.outcome.kind === "completed") task.status = "review";
        if (event.outcome.kind === "canceled") task.status = "canceled";
        task.result = event.timeline
          .slice(promptIndex + 1)
          .filter((item) => item.type === "assistant_message")
          .map((item) => (item.type === "assistant_message" ? item.text : ""))
          .join("\n\n")
          .slice(-16000);
        if (event.outcome.kind === "failed")
          task.error = "The conversation reported a failed turn. Open it for details.";
        await save(board);
      }),
    dispose: async () => {
      disposed = true;
      await tail;
      touched.clear();
    },
  };
}
