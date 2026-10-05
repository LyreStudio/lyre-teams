import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { Board, Task } from "../shared/actions";
import { useCommand, useTeams } from "./context";
import { draftKey, useDraft, useFieldSetter } from "./drafts";
import { TaskDetail, taskTone } from "./task-detail";
import {
  GROUP_LABEL,
  STATUS_LABEL,
  blockers,
  criteriaLines,
  criteriaSummary,
  groupTasks,
  hasOpenQuestion,
  isClosed,
  memberLabel,
  requiredText,
  type TaskGroup,
} from "./model";
import {
  Button,
  Chevron,
  Choices,
  Dot,
  ErrorLine,
  Field,
  Input,
  L,
  PressRow,
  Sheet,
  useStyles,
} from "./ui";

export function TasksPane({
  selectedId,
  onSelect,
  split,
}: {
  selectedId: string | null;
  onSelect(taskId: string | null): void;
  split: boolean;
}) {
  const { board } = useTeams();
  const s = useStyles();
  const task = board.tasks.find((candidate) => candidate.id === selectedId) ?? null;
  const back = useCallback(() => onSelect(null), [onSelect]);
  if (split) {
    return (
      <View style={L.split}>
        <View style={L.listColumn}>
          <TaskList selectedId={task?.id ?? null} onSelect={onSelect} />
        </View>
        <View style={L.detailColumn}>
          {task ? (
            <TaskDetail key={task.id} task={task} onBack={null} />
          ) : (
            <View style={L.emptyCenter}>
              <Text style={s.muted}>Select a task</Text>
            </View>
          )}
        </View>
      </View>
    );
  }
  if (task) return <TaskDetail key={task.id} task={task} onBack={back} />;
  return <TaskList selectedId={null} onSelect={onSelect} />;
}

function listSummary(board: Board, done: number): string {
  if (board.tasks.length === 0) return "No tasks yet";
  return `${board.tasks.length - done} active · ${done} done`;
}

function TaskList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect(taskId: string): void;
}) {
  const { board, hostId, workspaceId } = useTeams();
  const s = useStyles();
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useDraft(draftKey(hostId, workspaceId, "show-done"), false);
  const groups = useMemo(() => groupTasks(board.tasks), [board.tasks]);
  const done = groups.find((entry) => entry.group === "done");
  const visible = groups.filter((entry) => entry.group !== "done" || showDone);
  const openForm = useCallback(() => setCreating(true), []);
  const closeForm = useCallback(() => setCreating(false), []);
  const toggleDone = useCallback(() => setShowDone((current) => !current), [setShowDone]);
  return (
    <View style={L.stack4}>
      <View style={L.between}>
        <Text style={s.small}>{listSummary(board, done?.tasks.length ?? 0)}</Text>
        <Button label="New task" icon="Plus" onPress={openForm} />
      </View>
      {board.tasks.length === 0 ? (
        <View style={L.empty}>
          <Text style={s.text}>Create a task to give your team an assignment</Text>
          <Text style={s.small}>
            {board.members.length === 0
              ? "Link an existing conversation in Team before choosing an owner."
              : "Creating a task does not start work."}
          </Text>
        </View>
      ) : null}
      {visible.map((entry) => (
        <TaskGroupList
          key={entry.group}
          group={entry.group}
          tasks={entry.tasks}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
      {done ? (
        <Button
          variant="ghost"
          label={showDone ? "Hide done tasks" : `Show done tasks (${done.tasks.length})`}
          onPress={toggleDone}
          style={L.startOnRail}
        />
      ) : null}
      <NewTaskForm open={creating} onClose={closeForm} onCreated={onSelect} />
    </View>
  );
}

function TaskGroupList({
  group,
  tasks,
  selectedId,
  onSelect,
}: {
  group: TaskGroup;
  tasks: readonly Task[];
  selectedId: string | null;
  onSelect(taskId: string): void;
}) {
  const { board } = useTeams();
  const s = useStyles();
  return (
    <View style={L.stack1}>
      <View style={L.groupHead}>
        <Text accessibilityRole="header" style={s.label}>
          {GROUP_LABEL[group]}
        </Text>
        <Text style={s.small}>{tasks.length}</Text>
      </View>
      <View>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            board={board}
            task={task}
            first
            selected={task.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

function rowMeta(board: Board, task: Task): string {
  const parts = [memberLabel(board, task.memberId)];
  const waiting = blockers(board, task);
  const first = waiting[0];
  if (first && !isClosed(task)) parts.push(`Blocked by ${first.title}`);
  const summary = criteriaSummary(task);
  if (summary.total) parts.push(`${summary.passed} of ${summary.total} checks passed`);
  return parts.join(" · ");
}

function TaskRow({
  board,
  task,
  first,
  selected,
  onSelect,
}: {
  board: Board;
  task: Task;
  first: boolean;
  selected: boolean;
  onSelect(taskId: string): void;
}) {
  const s = useStyles();
  const meta = rowMeta(board, task);
  const state = hasOpenQuestion(task) ? "Needs your input" : STATUS_LABEL[task.status];
  return (
    <PressRow
      first={first}
      selected={selected}
      value={task.id}
      label={`${task.title}. ${state}. ${meta}`}
      hint="Opens the task"
      onPress={onSelect}
    >
      <Dot tone={taskTone(task)} />
      <View style={L.fill}>
        <Text style={s.text}>{task.title}</Text>
        <Text style={s.small}>{meta}</Text>
      </View>
      <Chevron />
    </PressRow>
  );
}

interface NewTaskDraft {
  title: string;
  description: string;
  memberId: string | null;
  dependencies: string[];
  criteria: string;
}

const EMPTY_TASK: NewTaskDraft = {
  title: "",
  description: "",
  memberId: null,
  dependencies: [],
  criteria: "",
};

function criteriaProblem(lines: readonly string[]): string | null {
  if (lines.some((line) => line.length > 160)) return "Keep each criterion to 160 characters.";
  if (lines.length > 30) return "Use at most 30 criteria.";
  return null;
}

function NewTaskForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  onCreated(taskId: string): void;
}) {
  const { board, hostId, workspaceId, pending } = useTeams();
  const { send, error, setError } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "new-task");
  const [draft, setDraft, discard] = useDraft<NewTaskDraft>(key, EMPTY_TASK);
  const [submitted, setSubmitted] = useState(false);
  const setTitle = useFieldSetter(setDraft, "title");
  const setDescription = useFieldSetter(setDraft, "description");
  const setCriteria = useFieldSetter(setDraft, "criteria");
  const titleError = requiredText(draft.title, "a task title");
  const lines = criteriaLines(draft.criteria);
  const criteriaError = criteriaProblem(lines);
  const ownerSelection = useMemo(() => (draft.memberId ? [draft.memberId] : []), [draft.memberId]);
  const ownerOptions = useMemo(
    () => board.members.map((member) => ({ value: member.id, label: member.name })),
    [board.members],
  );
  const dependencyOptions = useMemo(
    () =>
      board.tasks
        .filter((task) => !isClosed(task))
        .map((task) => ({ value: task.id, label: task.title })),
    [board.tasks],
  );
  const toggleOwner = useCallback(
    (memberId: string) =>
      setDraft((current) => ({
        ...current,
        memberId: current.memberId === memberId ? null : memberId,
      })),
    [setDraft],
  );
  const toggleDependency = useCallback(
    (taskId: string) =>
      setDraft((current) => ({
        ...current,
        dependencies: current.dependencies.includes(taskId)
          ? current.dependencies.filter((id) => id !== taskId)
          : [...current.dependencies, taskId],
      })),
    [setDraft],
  );
  const reset = useCallback(() => {
    discard();
    setSubmitted(false);
    setError(null);
  }, [discard, setError]);
  const create = useCallback(async () => {
    setSubmitted(true);
    if (titleError || criteriaError) return;
    const before = new Set(board.tasks.map((task) => task.id));
    const saved = await send(
      {
        kind: "addTask",
        title: draft.title.trim(),
        description: draft.description.trim(),
        memberId: draft.memberId,
        dependencies: draft.dependencies,
        criteria: lines,
      },
      [key],
    );
    if (!saved) return;
    setSubmitted(false);
    onClose();
    // The created task is the one id the host returned that was absent before the change.
    const created = saved.tasks.find((task) => !before.has(task.id));
    if (created) onCreated(created.id);
  }, [titleError, criteriaError, board.tasks, send, draft, lines, key, onClose, onCreated]);
  const submit = useCallback(() => void create(), [create]);

  return (
    <Sheet title="New task" open={open} onClose={onClose}>
      <Field label="Task" error={submitted ? titleError : null}>
        <Input
          label="Task"
          value={draft.title}
          maxLength={160}
          onChangeText={setTitle}
          placeholder="Describe the result you want"
        />
      </Field>
      <Field label="Details" hint="Context the owner needs">
        <Input
          label="Details"
          multiline
          value={draft.description}
          onChangeText={setDescription}
          placeholder="Context and constraints"
        />
      </Field>
      <Field
        label="Acceptance criteria"
        hint="One per line. You record each check during review."
        error={criteriaError}
      >
        <Input
          label="Acceptance criteria"
          multiline
          value={draft.criteria}
          onChangeText={setCriteria}
          placeholder="Keyboard navigation works"
        />
      </Field>
      <Field
        label="Owner"
        hint={
          board.members.length
            ? "Optional. You can choose later."
            : "Link a conversation in Team to choose an owner."
        }
      >
        {board.members.length ? (
          <Choices
            label="Owner"
            selected={ownerSelection}
            options={ownerOptions}
            onToggle={toggleOwner}
          />
        ) : null}
      </Field>
      {dependencyOptions.length ? (
        <Field label="Depends on" hint="Starts only after these are accepted">
          <Choices
            label="Depends on"
            multiple
            selected={draft.dependencies}
            options={dependencyOptions}
            onToggle={toggleDependency}
          />
        </Field>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Text style={s.small}>
        Creating a task does not start work. Your draft is kept if you close this.
      </Text>
      <View style={s.actions}>
        <Button variant="ghost" label="Discard draft" onPress={reset} />
        <Button
          variant="primary"
          label="Create task"
          busy={pending}
          busyLabel="Creating..."
          onPress={submit}
        />
      </View>
    </Sheet>
  );
}
