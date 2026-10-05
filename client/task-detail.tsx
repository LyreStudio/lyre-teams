import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { Task } from "../shared/actions";
import { useCommand, useTeams } from "./context";
import { draftKey, useDraft } from "./drafts";
import {
  CRITERION_LABEL,
  CRITERION_TONE,
  DELIVERY_HINT,
  DELIVERY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  blockers,
  criteriaSummary,
  findMember,
  hasOpenQuestion,
  isActive,
  isClosed,
  memberLabel,
  startBlockedReason,
  taskAgentId,
  taskGroup,
  type CriterionStatus,
  type Tone,
} from "./model";
import {
  Badge,
  Button,
  Card,
  Choices,
  Confirm,
  ErrorLine,
  Field,
  Input,
  L,
  Notice,
  Row,
  Section,
  useStyles,
} from "./ui";

export function taskTone(task: Task): Tone {
  const group = taskGroup(task);
  if (group === "input") return "warning";
  if (group === "review") return "success";
  return STATUS_TONE[task.status];
}

function agentLine(title: string | undefined, agentId: string | null): string {
  if (!agentId) return "No linked conversation";
  return title ?? "Conversation not in this workspace";
}

export function TaskDetail({ task, onBack }: { task: Task; onBack: (() => void) | null }) {
  const { board, agents } = useTeams();
  const s = useStyles();
  const owner = findMember(board, task.memberId);
  const agentId = taskAgentId(board, task);
  const agent = agentId ? agents.get(agentId) : undefined;
  const waiting = blockers(board, task);
  return (
    <View style={L.stack6}>
      <View style={L.stack2}>
        {onBack ? (
          <Button
            variant="ghost"
            icon="ChevronLeft"
            label="Back to tasks"
            onPress={onBack}
            style={L.startOnRail}
          />
        ) : null}
        <Badge
          label={hasOpenQuestion(task) ? "Needs your input" : STATUS_LABEL[task.status]}
          tone={taskTone(task)}
        />
        <Text accessibilityRole="header" selectable style={s.detailTitle}>
          {task.title}
        </Text>
        <Text style={s.small}>
          {owner?.name ?? memberLabel(board, task.memberId)}
          {agent ? ` · ${agent.title}` : ""}
        </Text>
        {task.description.trim() ? (
          <Text selectable style={s.muted}>
            {task.description}
          </Text>
        ) : null}
      </View>
      {waiting.length > 0 && !isClosed(task) ? (
        <Notice tone="neutral" title="Waiting on other tasks">
          <Text style={s.muted}>
            {waiting.map((item) => item.title).join(", ")}. Waiting does not use a worker slot.
          </Text>
        </Notice>
      ) : null}
      {task.question ? <QuestionNotice task={task} /> : null}
      <Step task={task} />
      <OwnerSection task={task} />
      <CriteriaSection task={task} />
      <DependenciesSection task={task} />
      <Section title="Attempt and delivery">
        <Card>
          <Row first>
            <Text style={s.textFill}>Attempt</Text>
            <Text style={s.value}>{task.attempt > 0 ? String(task.attempt) : "None yet"}</Text>
          </Row>
          <Row>
            <View style={L.fill}>
              <Text style={s.text}>Latest assignment</Text>
              <Text style={s.small}>{DELIVERY_HINT[task.delivery]}</Text>
            </View>
            <Text style={task.delivery === "unknown" ? s.warningValue : s.value}>
              {DELIVERY_LABEL[task.delivery]}
            </Text>
          </Row>
        </Card>
      </Section>
      <AttemptHistory task={task} />
      <Section title="Conversation">
        <Card>
          <Row first layout="form">
            <View style={L.fill}>
              <Text style={s.text}>{agentLine(agent?.title, agentId)}</Text>
              <Text style={s.small}>Permission requests and activity stay in the conversation</Text>
            </View>
            <OpenConversation agentId={agentId} variant="outline" />
          </Row>
        </Card>
      </Section>
      {!isClosed(task) && !hasOpenQuestion(task) ? <RecordQuestion task={task} /> : null}
    </View>
  );
}

function AttemptHistory({ task }: { task: Task }) {
  const s = useStyles();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  if (!task.history.length) return null;
  return (
    <Section title="Earlier attempts">
      <Button
        label={expanded ? "Hide earlier attempts" : `Show ${task.history.length} earlier attempts`}
        onPress={toggle}
      />
      {expanded
        ? task.history.map((attempt) => (
            <Card key={attempt.attempt}>
              <Row first>
                <Text style={s.text}>
                  Attempt {attempt.attempt} · {attempt.status}
                </Text>
              </Row>
              <Row>
                <Text selectable style={s.muted}>
                  {attempt.result || attempt.error || "No result recorded"}
                </Text>
              </Row>
              {attempt.criteria.map((criterion) => (
                <Row key={criterion.id}>
                  <View style={L.fill}>
                    <Text style={s.text}>
                      {CRITERION_LABEL[criterion.status]} · {criterion.text}
                    </Text>
                    {criterion.evidence ? (
                      <Text selectable style={s.small}>
                        {criterion.evidence}
                      </Text>
                    ) : null}
                  </View>
                </Row>
              ))}
              {attempt.answer ? (
                <Row>
                  <Text selectable style={s.muted}>
                    Saved decision: {attempt.answer}
                  </Text>
                </Row>
              ) : null}
            </Card>
          ))
        : null}
    </Section>
  );
}

function OpenConversation({
  agentId,
  variant = "ghost",
}: {
  agentId: string | null;
  variant?: "ghost" | "outline" | "primary";
}) {
  const { openConversation } = useTeams();
  const open = useCallback(() => {
    if (agentId && openConversation) openConversation(agentId);
  }, [agentId, openConversation]);
  if (!agentId || !openConversation) return null;
  return <Button variant={variant} label="Open conversation" onPress={open} />;
}

function Step({ task }: { task: Task }) {
  switch (task.status) {
    case "planned":
      return <PlannedStep task={task} />;
    case "working":
    case "unknown":
      return <ActiveStep task={task} />;
    case "review":
      return <ReviewStep task={task} />;
    case "failed":
      return <FailedStep task={task} />;
    default:
      return <ClosedStep task={task} />;
  }
}

function QuestionNotice({ task }: { task: Task }) {
  const { board, hostId, workspaceId, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "answer", task.id);
  const [answer, setAnswer] = useDraft(key, task.answer);
  const empty = answer.trim() === "";
  const unchanged = answer.trim() === task.answer;
  let saveHint: string | undefined;
  if (unchanged) saveHint = "Answer saved";
  if (empty) saveHint = "Write an answer first";
  if (isClosed(task)) saveHint = "This task is closed";
  const save = useCallback(() => {
    void send({ kind: "answer", taskId: task.id, answer: answer.trim() }, [key]);
  }, [send, task.id, answer, key]);
  return (
    <Notice
      tone={task.answer ? "neutral" : "warning"}
      title={`Question for ${memberLabel(board, task.memberId)}`}
    >
      <Text selectable style={s.text}>
        {task.question}
      </Text>
      {task.answer ? (
        <Text selectable style={s.muted}>
          Saved decision: {task.answer}
        </Text>
      ) : null}
      <Field label="Your answer" error={error}>
        <Input
          label="Your answer"
          multiline
          value={answer}
          onChangeText={setAnswer}
          placeholder="Write your decision"
        />
      </Field>
      <View style={L.wrap}>
        <Button
          variant={task.answer ? "outline" : "primary"}
          label="Save answer"
          busy={pending}
          busyLabel="Saving..."
          disabled={empty || unchanged || isClosed(task)}
          hint={saveHint}
          onPress={save}
        />
        <OpenConversation agentId={taskAgentId(board, task)} />
      </View>
      <Text style={s.small}>
        {isActive(task)
          ? "Saving does not send anything. The running attempt does not receive it; say it in the conversation if it is needed now."
          : "Saving does not send anything. The answer is included the next time you start this task."}
      </Text>
    </Notice>
  );
}

function PlannedStep({ task }: { task: Task }) {
  const { board, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const reason = startBlockedReason(board, task);
  const start = useCallback(() => void send({ kind: "start", taskId: task.id }), [send, task.id]);
  return (
    <Notice tone="neutral" title="Not started">
      <Text style={s.muted}>
        Start sends this assignment, its criteria and any saved answer to the owner’s linked
        conversation. Nothing starts until you choose it.
      </Text>
      <Button
        variant="primary"
        label="Start task"
        busy={pending}
        busyLabel="Starting..."
        disabled={reason !== null}
        hint={reason ?? undefined}
        onPress={start}
        style={L.start}
      />
      {reason ? <Text style={s.small}>{reason}</Text> : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </Notice>
  );
}

/** Working and unconfirmed attempts: both hold a slot until the turn ends, is stopped or reviewed. */
function ActiveStep({ task }: { task: Task }) {
  const { board, hostId, workspaceId, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const unknown = task.status === "unknown";
  const resultKey = draftKey(hostId, workspaceId, "result", task.id);
  const [result, setResult] = useDraft(resultKey, "");
  const [manual, setManual] = useDraft(draftKey(hostId, workspaceId, "manual", task.id), false);
  const [confirm, setConfirm] = useState<"stop" | "retry" | null>(null);
  const close = useCallback(() => setConfirm(null), []);
  const act = useCallback(
    async (action: string) => {
      if (action === "toggle-manual") return setManual((current) => !current);
      if (action === "ask-stop") return setConfirm("stop");
      if (action === "ask-retry") return setConfirm("retry");
      if (action === "review") {
        await send({ kind: "review", taskId: task.id, result: result.trim() }, [resultKey]);
        return;
      }
      const kind = action === "stop" ? "cancel" : "retry";
      if (await send({ kind, taskId: task.id })) setConfirm(null);
    },
    [send, setManual, task.id, result, resultKey],
  );
  const press = useCallback((action: string) => void act(action), [act]);
  const confirmStop = useCallback(() => press("stop"), [press]);
  const confirmRetry = useCallback(() => press("retry"), [press]);
  return (
    <Notice
      tone={unknown ? "warning" : "accent"}
      title={unknown ? "Outcome unknown" : `Working · ${DELIVERY_LABEL[task.delivery]}`}
    >
      <Text selectable style={s.muted}>
        {unknown
          ? task.error.trim() ||
            "The computer could not confirm what happened. Inspect the conversation before retrying."
          : "When the conversation’s turn ends, Teams records its reply here for your review."}
      </Text>
      {unknown ? (
        <Text style={s.small}>
          This attempt holds a worker slot until you stop it, record its result or retry it. Teams
          never replays it on its own.
        </Text>
      ) : null}
      <View style={L.wrap}>
        <OpenConversation
          agentId={taskAgentId(board, task)}
          variant={unknown ? "primary" : "ghost"}
        />
        <Button
          variant="ghost"
          action="toggle-manual"
          label={manual ? "Hide result form" : "Record result"}
          onPress={press}
        />
        {unknown ? <Button action="ask-retry" label="Retry" onPress={press} /> : null}
        <Button variant="outline" action="ask-stop" label="Stop and cancel" onPress={press} />
      </View>
      {manual ? (
        <View style={L.stack2}>
          <Field
            label="Result"
            hint="Use this when the turn has finished but Teams did not record it"
          >
            <Input
              label="Result"
              multiline
              value={result}
              onChangeText={setResult}
              placeholder="What changed and where to look"
            />
          </Field>
          <Button
            action="review"
            label="Submit for review"
            busy={pending}
            busyLabel="Saving..."
            disabled={result.trim() === ""}
            hint={result.trim() === "" ? "Record a result first" : undefined}
            onPress={press}
            style={L.start}
          />
        </View>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Confirm
        open={confirm === "stop"}
        title="Stop and cancel this task?"
        confirmLabel="Stop and cancel"
        destructive
        busy={pending}
        onClose={close}
        onConfirm={confirmStop}
      >
        <Text style={s.text}>
          Teams asks the computer to stop the linked conversation’s turn, then marks the task
          canceled. Its results stay in the team.
        </Text>
        <Text style={s.small}>
          If the turn is still finishing, the task stays active. Wait for it, then try again.
        </Text>
      </Confirm>
      <RetryConfirm
        task={task}
        open={confirm === "retry"}
        busy={pending}
        onClose={close}
        onConfirm={confirmRetry}
      />
    </Notice>
  );
}

function RetryConfirm({
  task,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  task: Task;
  open: boolean;
  busy: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  const s = useStyles();
  return (
    <Confirm
      open={open}
      title="Plan another attempt?"
      confirmLabel="Plan attempt"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <Text style={s.text}>
        The task returns to Planned. Start it again when you are ready; nothing is sent now.
      </Text>
      {task.criteria.length ? (
        <Text style={s.small}>Recorded checks reset to Not checked for the new attempt.</Text>
      ) : null}
      {isActive(task) ? (
        <Text style={s.small}>
          The computer refuses this while the previous turn is still running. Inspect the
          conversation first.
        </Text>
      ) : null}
    </Confirm>
  );
}

function ReviewStep({ task }: { task: Task }) {
  const { board, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const [confirm, setConfirm] = useState<"accept" | "retry" | null>(null);
  const summary = criteriaSummary(task);
  const notPassed = useMemo(
    () => task.criteria.filter((criterion) => criterion.status !== "passed"),
    [task.criteria],
  );
  const close = useCallback(() => setConfirm(null), []);
  const press = useCallback((action: string) => {
    if (action === "accept" || action === "retry") setConfirm(action);
  }, []);
  const accept = useCallback(async () => {
    if (await send({ kind: "accept", taskId: task.id })) setConfirm(null);
  }, [send, task.id]);
  const retry = useCallback(async () => {
    if (await send({ kind: "retry", taskId: task.id })) setConfirm(null);
  }, [send, task.id]);
  const confirmAccept = useCallback(() => void accept(), [accept]);
  const confirmRetry = useCallback(() => void retry(), [retry]);
  const unresolved = summary.unchecked + summary.failed;
  return (
    <Notice tone="success" title="Ready for your review">
      <Text selectable style={s.text}>
        {task.result.trim() || "No result was recorded."}
      </Text>
      <View style={L.wrap}>
        <Button
          variant="primary"
          action="accept"
          label="Accept result"
          busy={pending}
          onPress={press}
        />
        <Button action="retry" label="Plan another attempt" onPress={press} />
        <OpenConversation agentId={taskAgentId(board, task)} />
      </View>
      {unresolved > 0 ? (
        <Text style={s.small}>
          {unresolved} of {summary.total} criteria have not passed. Accepting records that; it does
          not mark them as passed.
        </Text>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Confirm
        open={confirm === "accept"}
        title="Accept this result?"
        confirmLabel={notPassed.length ? "Accept with criteria not passed" : "Accept result"}
        busy={pending}
        onClose={close}
        onConfirm={confirmAccept}
      >
        {notPassed.length ? (
          <>
            <Text style={s.text}>These criteria have not passed:</Text>
            {notPassed.map((criterion) => (
              <Text key={criterion.id} style={s.muted}>
                {CRITERION_LABEL[criterion.status]} · {criterion.text}
              </Text>
            ))}
            <Text style={s.small}>Acceptance records them as they are.</Text>
          </>
        ) : (
          <Text style={s.text}>Every criterion has passed. Accepting completes this task.</Text>
        )}
        <Text style={s.small}>No commit, push or publication follows acceptance.</Text>
      </Confirm>
      <RetryConfirm
        task={task}
        open={confirm === "retry"}
        busy={pending}
        onClose={close}
        onConfirm={confirmRetry}
      />
    </Notice>
  );
}

function FailedStep({ task }: { task: Task }) {
  const { board, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const retry = useCallback(async () => {
    if (await send({ kind: "retry", taskId: task.id })) setOpen(false);
  }, [send, task.id]);
  const confirmRetry = useCallback(() => void retry(), [retry]);
  return (
    <Notice tone="danger" title="The attempt failed">
      <Text selectable style={s.muted}>
        {task.error.trim() || "The computer did not record a reason."}
      </Text>
      <View style={L.wrap}>
        <Button variant="primary" label="Plan another attempt" onPress={show} />
        <OpenConversation agentId={taskAgentId(board, task)} />
      </View>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <RetryConfirm
        task={task}
        open={open}
        busy={pending}
        onClose={close}
        onConfirm={confirmRetry}
      />
    </Notice>
  );
}

function ClosedStep({ task }: { task: Task }) {
  const { pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const accepted = task.status === "accepted";
  const summary = criteriaSummary(task);
  const unresolved = summary.unchecked + summary.failed;
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const retry = useCallback(async () => {
    if (await send({ kind: "retry", taskId: task.id })) setOpen(false);
  }, [send, task.id]);
  const confirmRetry = useCallback(() => void retry(), [retry]);
  return (
    <Notice tone={accepted ? "success" : "neutral"} title={accepted ? "Accepted" : "Canceled"}>
      <Text selectable style={s.muted}>
        {task.result.trim() || task.error.trim() || "No result was recorded."}
      </Text>
      {accepted && unresolved > 0 ? (
        <Text style={s.small}>Accepted with {unresolved} criteria not passed.</Text>
      ) : null}
      {accepted ? null : <Button label="Plan another attempt" onPress={show} style={L.start} />}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <RetryConfirm
        task={task}
        open={open}
        busy={pending}
        onClose={close}
        onConfirm={confirmRetry}
      />
    </Notice>
  );
}

function RecordQuestion({ task }: { task: Task }) {
  const { hostId, workspaceId, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "question", task.id);
  const [question, setQuestion] = useDraft(key, "");
  const [open, setOpen] = useDraft(draftKey(hostId, workspaceId, "ask-open", task.id), false);
  const toggle = useCallback(() => setOpen((current) => !current), [setOpen]);
  const save = useCallback(() => {
    void send({ kind: "question", taskId: task.id, question: question.trim() }, [key]);
  }, [send, task.id, question, key]);
  return (
    <Section title="Decisions">
      <Button
        variant="ghost"
        label={open ? "Hide question form" : "Record a question"}
        onPress={toggle}
        style={L.startOnRail}
      />
      {open ? (
        <View style={L.stack2}>
          <Field label="Question" hint="Shown in Attention until you save an answer">
            <Input
              label="Question"
              multiline
              value={question}
              onChangeText={setQuestion}
              placeholder="What needs a decision?"
            />
          </Field>
          <Button
            label="Save question"
            busy={pending}
            busyLabel="Saving..."
            disabled={question.trim() === ""}
            onPress={save}
            style={L.start}
          />
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <Text style={s.small}>Questions are recorded for this task; nothing is sent.</Text>
        </View>
      ) : null}
    </Section>
  );
}

function OwnerSection({ task }: { task: Task }) {
  const { board, agents, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const editable =
    task.status === "planned" || task.status === "failed" || task.status === "canceled";
  const selection = useMemo(() => (task.memberId ? [task.memberId] : []), [task.memberId]);
  const options = useMemo(
    () =>
      board.members.map((member) => ({
        value: member.id,
        label: member.name,
        hint: agents.get(member.agentId)?.title ?? member.role,
      })),
    [board.members, agents],
  );
  const assign = useCallback(
    (memberId: string) => {
      if (memberId !== task.memberId) void send({ kind: "assign", taskId: task.id, memberId });
    },
    [send, task.id, task.memberId],
  );
  if (!editable) return null;
  if (board.members.length === 0) {
    return (
      <Section title="Owner">
        <Text style={s.small}>Link an existing conversation in Team to choose an owner.</Text>
      </Section>
    );
  }
  return (
    <Section title="Owner">
      <Choices
        label="Task owner"
        disabled={pending}
        selected={selection}
        options={options}
        onToggle={assign}
      />
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </Section>
  );
}

function DependenciesSection({ task }: { task: Task }) {
  const { board } = useTeams();
  const s = useStyles();
  if (task.dependencies.length === 0) return null;
  return (
    <Section title="Depends on">
      <Card>
        {task.dependencies.map((id, index) => {
          const dependency = board.tasks.find((candidate) => candidate.id === id);
          return (
            <Row key={id} first={index === 0}>
              <Text style={s.textFill}>{dependency?.title ?? "Missing task"}</Text>
              <Badge
                label={dependency ? STATUS_LABEL[dependency.status] : "Unavailable"}
                tone={dependency ? STATUS_TONE[dependency.status] : "warning"}
              />
            </Row>
          );
        })}
      </Card>
    </Section>
  );
}

function CriteriaSection({ task }: { task: Task }) {
  const s = useStyles();
  const summary = criteriaSummary(task);
  const editable = task.status === "review";
  return (
    <Section
      title="Acceptance criteria"
      trailing={summary.total ? `${summary.passed} of ${summary.total} passed` : undefined}
    >
      {summary.total === 0 ? (
        <Text style={s.small}>No criteria. The result is reviewed as a whole.</Text>
      ) : (
        <Card>
          {task.criteria.map((criterion, index) => (
            <CriterionRow
              key={criterion.id}
              task={task}
              criterion={criterion}
              first={index === 0}
              editable={editable}
            />
          ))}
        </Card>
      )}
      <Text style={s.small}>
        {editable
          ? "Record each check yourself with its evidence. Teams never marks a check as passed."
          : "Checks are recorded during review. Teams never marks a check as passed."}
      </Text>
    </Section>
  );
}

const CRITERION_OPTIONS = (["not-checked", "passed", "failed"] as const).map((value) => ({
  value,
  label: CRITERION_LABEL[value],
}));

interface CriterionDraft {
  status: CriterionStatus;
  evidence: string;
}

function evidenceLine(criterion: Task["criteria"][number]): string {
  if (criterion.evidence.trim()) return criterion.evidence;
  return criterion.status === "not-checked" ? "Needs review" : "No evidence recorded";
}

function CriterionRow({
  task,
  criterion,
  first,
  editable,
}: {
  task: Task;
  criterion: Task["criteria"][number];
  first: boolean;
  editable: boolean;
}) {
  const { hostId, workspaceId, pending } = useTeams();
  const { send, error, setError } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "criterion", task.id, criterion.id);
  const [draft, setDraft, discard] = useDraft<CriterionDraft | null>(key, null);
  const selection = useMemo(() => (draft ? [draft.status] : []), [draft]);
  const begin = useCallback(
    () => setDraft({ status: criterion.status, evidence: criterion.evidence }),
    [setDraft, criterion.status, criterion.evidence],
  );
  const setStatus = useCallback(
    (status: CriterionStatus) =>
      setDraft((current) => ({ evidence: current?.evidence ?? "", status })),
    [setDraft],
  );
  const setEvidence = useCallback(
    (evidence: string) =>
      setDraft((current) => ({ status: current?.status ?? criterion.status, evidence })),
    [setDraft, criterion.status],
  );
  const save = useCallback(() => {
    if (!draft) return;
    const evidence = draft.evidence.trim();
    if (draft.status !== "not-checked" && !evidence) {
      setError("Describe the evidence for this check.");
      return;
    }
    void send(
      {
        kind: "criterion",
        taskId: task.id,
        criterionId: criterion.id,
        status: draft.status,
        evidence,
      },
      [key],
    );
  }, [draft, send, setError, task.id, criterion.id, key]);
  return (
    <Row first={first} layout="stack">
      <View style={L.rowTop}>
        <View style={L.fill}>
          <Text style={s.text}>{criterion.text}</Text>
          <Text style={s.small}>{evidenceLine(criterion)}</Text>
        </View>
        <Badge label={CRITERION_LABEL[criterion.status]} tone={CRITERION_TONE[criterion.status]} />
      </View>
      {editable && !draft ? (
        <Button variant="ghost" label="Record check" onPress={begin} style={L.startOnRail} />
      ) : null}
      {editable && draft ? (
        <View style={L.stack2}>
          <Choices
            label={`Result for ${criterion.text}`}
            options={CRITERION_OPTIONS}
            selected={selection}
            onToggle={setStatus}
          />
          <Input
            label={`Evidence for ${criterion.text}`}
            value={draft.evidence}
            onChangeText={setEvidence}
            placeholder="What you checked and where"
          />
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <View style={L.wrap}>
            <Button label="Save check" busy={pending} busyLabel="Saving..." onPress={save} />
            <Button variant="ghost" label="Discard" onPress={discard} />
          </View>
        </View>
      ) : null}
    </Row>
  );
}
