import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const short = z.string().trim().min(1).max(160);
const text = z.string().max(16000);
export const criterionSchema = z
  .object({
    id,
    text: short,
    status: z.enum(["not-checked", "passed", "failed"]),
    evidence: text,
  })
  .strict();
export const memberSchema = z
  .object({ id, name: short, role: short, agentId: id, parentId: id.nullable() })
  .strict();
const attemptSchema = z
  .object({
    attempt: z.number().int().min(1),
    agentId: id.nullable(),
    status: z.string().max(20),
    delivery: z.string().max(20),
    result: text,
    error: text,
    criteria: z.array(criterionSchema).max(30),
    question: text,
    answer: text,
  })
  .strict();
export const taskSchema = z
  .object({
    id,
    title: short,
    description: text,
    memberId: id.nullable(),
    dependencies: z.array(id).max(100),
    criteria: z.array(criterionSchema).max(30),
    status: z.enum(["planned", "working", "review", "accepted", "failed", "canceled", "unknown"]),
    attempt: z.number().int().min(0),
    agentId: id.nullable(),
    delivery: z.enum(["none", "submitting", "submitted", "observed", "unknown"]),
    question: text,
    answer: text,
    result: text,
    error: text,
    history: z.array(attemptSchema).max(30).default([]),
  })
  .strict();
export const boardSchema = z
  .object({
    revision: z.number().int().min(0),
    workspaceId: id,
    projectId: id,
    name: short,
    paused: z.boolean(),
    maxWorkers: z.number().int().min(1).max(8),
    members: z.array(memberSchema).max(20),
    tasks: z.array(taskSchema).max(100),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("configure"),
      name: short,
      paused: z.boolean(),
      maxWorkers: z.number().int().min(1).max(8),
    })
    .strict(),
  z
    .object({
      kind: z.literal("addMember"),
      name: short,
      role: short,
      agentId: id,
      parentId: id.nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("removeMember"), memberId: id }).strict(),
  z
    .object({
      kind: z.literal("addTask"),
      title: short,
      description: text,
      memberId: id.nullable(),
      dependencies: z.array(id).max(100),
      criteria: z.array(short).max(30),
    })
    .strict(),
  z.object({ kind: z.literal("assign"), taskId: id, memberId: id }).strict(),
  ...(["start", "cancel", "accept", "retry"] as const).map((kind) =>
    z.object({ kind: z.literal(kind), taskId: id }).strict(),
  ),
  z.object({ kind: z.literal("review"), taskId: id, result: text }).strict(),
  z.object({ kind: z.literal("question"), taskId: id, question: text }).strict(),
  z.object({ kind: z.literal("answer"), taskId: id, answer: text }).strict(),
  z
    .object({
      kind: z.literal("criterion"),
      taskId: id,
      criterionId: id,
      status: criterionSchema.shape.status,
      evidence: text,
    })
    .strict(),
]);
export type Board = z.infer<typeof boardSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Command = z.infer<typeof commandSchema>;
export const readTeams = defineRpc({
  name: "teams.read",
  input: z.object({ workspaceId: id }).strict(),
  output: boardSchema,
});
export const changeTeams = defineRpc({
  name: "teams.change",
  input: z
    .object({ workspaceId: id, revision: z.number().int().min(0), command: commandSchema })
    .strict(),
  output: boardSchema,
});
