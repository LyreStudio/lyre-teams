import type { Board, Command, Member, Task } from "../shared/actions";
import { commandSchema } from "../shared/actions";

export type TaskStatus = Task["status"];
export type Criterion = Task["criteria"][number];
export type CriterionStatus = Criterion["status"];
export type Delivery = Task["delivery"];
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** The subset of a host agent record that Teams renders. */
export interface LinkedAgent {
  id: string;
  title: string;
  provider: string;
  status: string;
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: "Planned",
  working: "Working",
  review: "Ready to review",
  accepted: "Accepted",
  failed: "Failed",
  canceled: "Canceled",
  unknown: "Outcome unknown",
};

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  planned: "neutral",
  working: "accent",
  review: "accent",
  accepted: "success",
  failed: "danger",
  canceled: "neutral",
  unknown: "warning",
};

export const CRITERION_LABEL: Record<CriterionStatus, string> = {
  "not-checked": "Not checked",
  passed: "Passed",
  failed: "Failed",
};

export const CRITERION_TONE: Record<CriterionStatus, Tone> = {
  "not-checked": "neutral",
  passed: "success",
  failed: "danger",
};

export const DELIVERY_LABEL: Record<Delivery, string> = {
  none: "Not sent",
  submitting: "Submitting...",
  submitted: "Submitted to provider",
  observed: "Observed at supported boundary",
  unknown: "Outcome unknown",
};

export const DELIVERY_HINT: Record<Delivery, string> = {
  none: "Nothing has been sent for this attempt",
  submitting: "Waiting for the computer to confirm submission",
  submitted: "Provider acceptance does not prove the agent read it",
  observed: "The computer observed delivery at a supported boundary",
  unknown: "Check the linked conversation before retrying. Teams does not resend on its own.",
};

export type TaskGroup = "input" | "review" | "recovery" | "working" | "planned" | "done";

export const GROUP_ORDER: readonly TaskGroup[] = [
  "input",
  "review",
  "recovery",
  "working",
  "planned",
  "done",
];

export const GROUP_LABEL: Record<TaskGroup, string> = {
  input: "Needs your input",
  review: "Ready to review",
  recovery: "Needs recovery",
  working: "Working",
  planned: "Planned",
  done: "Done",
};

export function isClosed(task: Task): boolean {
  return task.status === "accepted" || task.status === "canceled";
}

export function hasOpenQuestion(task: Task): boolean {
  return task.question.trim() !== "" && task.answer.trim() === "" && !isClosed(task);
}

export function taskGroup(task: Task): TaskGroup {
  if (isClosed(task)) return "done";
  if (hasOpenQuestion(task)) return "input";
  if (task.status === "review") return "review";
  if (task.status === "failed" || task.status === "unknown") return "recovery";
  if (task.status === "working") return "working";
  return "planned";
}

export function groupTasks(tasks: readonly Task[]): { group: TaskGroup; tasks: Task[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    tasks: tasks.filter((task) => taskGroup(task) === group),
  })).filter((entry) => entry.tasks.length > 0);
}

export function criteriaSummary(task: Task) {
  let passed = 0;
  let failed = 0;
  let unchecked = 0;
  for (const criterion of task.criteria) {
    if (criterion.status === "passed") passed += 1;
    else if (criterion.status === "failed") failed += 1;
    else unchecked += 1;
  }
  return { passed, failed, unchecked, total: task.criteria.length };
}

export function findMember(board: Board, memberId: string | null): Member | null {
  if (!memberId) return null;
  return board.members.find((member) => member.id === memberId) ?? null;
}

export function memberLabel(board: Board, memberId: string | null): string {
  if (!memberId) return "Unassigned";
  return findMember(board, memberId)?.name ?? "Removed member";
}

/** Dependencies that are not accepted yet, including ones that no longer exist. */
export function blockers(board: Board, task: Task): { id: string; title: string }[] {
  return task.dependencies.flatMap((id) => {
    const dependency = board.tasks.find((candidate) => candidate.id === id);
    if (!dependency) return [{ id, title: "Missing task" }];
    return dependency.status === "accepted" ? [] : [{ id, title: dependency.title }];
  });
}

/** Working and unconfirmed attempts both hold a worker slot until inspected or stopped. */
export function isActive(task: Task): boolean {
  return task.status === "working" || task.status === "unknown";
}

export function activeWorkers(board: Board): number {
  return board.tasks.filter(isActive).length;
}

/** Why Start is unavailable, phrased as the next step. Null when the host may accept it. */
export function startBlockedReason(board: Board, task: Task): string | null {
  if (!task.memberId) return "Choose an owner before starting.";
  const owner = findMember(board, task.memberId);
  if (!owner) return "The owner was removed. Choose another owner.";
  const waiting = blockers(board, task);
  if (waiting.length > 0) {
    return `Waiting for ${waiting.map((item) => item.title).join(", ")} to be accepted.`;
  }
  if (board.paused) return "The team is paused. Resume it in Settings to start work.";
  if (board.tasks.some((other) => isActive(other) && other.agentId === owner.agentId)) {
    return `${owner.name} already has active work. Finish or stop it first.`;
  }
  const busy = activeWorkers(board);
  if (busy >= board.maxWorkers) {
    return `${busy} of ${board.maxWorkers} worker slots are in use. Finish, stop or review one, or raise the limit in Settings.`;
  }
  return null;
}

/** The conversation that carries a task: the attempt's agent, else the owner's linked agent. */
export function taskAgentId(board: Board, task: Task): string | null {
  if (task.status === "planned") return findMember(board, task.memberId)?.agentId ?? null;
  return task.agentId ?? findMember(board, task.memberId)?.agentId ?? null;
}

export type AttentionKind = "question" | "review" | "failed" | "unknown" | "permission";

export interface AttentionEntry {
  key: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  taskId: string | null;
  agentId: string | null;
}

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  question: "Questions",
  review: "Review requests",
  failed: "Failed work",
  unknown: "Unconfirmed outcomes",
  permission: "Permission requests",
};

/** One actionable entry per task; permission requests stay with their conversation. */
export function attentionEntries(
  board: Board,
  agents: ReadonlyMap<string, LinkedAgent>,
): AttentionEntry[] {
  const entries: AttentionEntry[] = [];
  for (const task of board.tasks) {
    const owner = memberLabel(board, task.memberId);
    const base = { taskId: task.id, agentId: taskAgentId(board, task), title: task.title };
    if (hasOpenQuestion(task)) {
      entries.push({ ...base, key: `q:${task.id}`, kind: "question", detail: task.question });
    } else if (task.status === "review") {
      entries.push({
        ...base,
        key: `r:${task.id}`,
        kind: "review",
        detail: `${owner} · Review the result and criteria`,
      });
    } else if (task.status === "failed") {
      entries.push({
        ...base,
        key: `f:${task.id}`,
        kind: "failed",
        detail: task.error.trim() || `${owner} · The attempt failed`,
      });
    } else if (task.status === "unknown") {
      entries.push({
        ...base,
        key: `u:${task.id}`,
        kind: "unknown",
        detail: `${owner} · Check the conversation before retrying`,
      });
    }
  }
  const seen = new Set<string>();
  for (const member of board.members) {
    const agent = agents.get(member.agentId);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    if (agent.requiresAttention && agent.attentionReason === "permission") {
      entries.push({
        key: `p:${agent.id}`,
        kind: "permission",
        title: `${member.name} is waiting for permission`,
        detail: `Answer it in ${agent.title}`,
        taskId: null,
        agentId: agent.id,
      });
    }
  }
  return entries;
}

export interface TreeNode {
  member: Member;
  depth: number;
}

/** Members ordered as a delegation tree. Missing parents and cycles fall back to the root. */
export function memberTree(members: readonly Member[]): TreeNode[] {
  const ids = new Set(members.map((member) => member.id));
  const children = new Map<string | null, Member[]>();
  for (const member of members) {
    const parent = member.parentId && ids.has(member.parentId) ? member.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), member]);
  }
  const ordered: TreeNode[] = [];
  const visited = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const member of children.get(parent) ?? []) {
      if (visited.has(member.id)) continue;
      visited.add(member.id);
      ordered.push({ member, depth });
      visit(member.id, depth + 1);
    }
  };
  visit(null, 0);
  for (const member of members) {
    if (!visited.has(member.id)) ordered.push({ member, depth: 0 });
  }
  return ordered;
}

export type ParsedCommand = { ok: true; command: Command } | { ok: false; message: string };

/** Final gate: the value shown as valid is exactly what the host receives. */
export function parseCommand(command: Command): ParsedCommand {
  const result = commandSchema.safeParse(command);
  if (result.success) return { ok: true, command: result.data };
  const issue = result.error.issues[0];
  const field = issue?.path.length ? issue.path.map(String).join(".") : "value";
  return { ok: false, message: `Check ${field}: ${issue?.message ?? "invalid value"}` };
}

export const TEXT_LIMIT = 160;

export function requiredText(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `Enter ${label}.`;
  if (trimmed.length > TEXT_LIMIT) return `Keep ${label} to ${TEXT_LIMIT} characters.`;
  return null;
}

export function criteriaLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The computer did not return a reason.";
}
