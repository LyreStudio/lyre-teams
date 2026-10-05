import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { Member } from "../shared/actions";
import { useCommand, useTeams } from "./context";
import { draftKey, useDraft, useFieldSetter } from "./drafts";
import { memberTree, requiredText, type LinkedAgent, type Tone } from "./model";
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
  MAP_INDENT_LEVELS,
  Row,
  Section,
  Sheet,
  Tabs,
  useStyles,
  type TabOption,
} from "./ui";

type TeamView = "list" | "map";
const VIEW_TABS: readonly TabOption<TeamView>[] = [
  { value: "list", label: "List" },
  { value: "map", label: "Map" },
];

function agentTone(agent: LinkedAgent | undefined): Tone {
  if (!agent) return "neutral";
  if (agent.requiresAttention) return agent.attentionReason === "error" ? "danger" : "warning";
  if (agent.status === "running" || agent.status === "initializing") return "accent";
  if (agent.status === "error") return "danger";
  return "neutral";
}

function agentStatus(agent: LinkedAgent | undefined, loaded: boolean): string {
  if (!agent) return loaded ? "Not in this workspace" : "Loading...";
  if (agent.requiresAttention && agent.attentionReason === "permission") {
    return "Waiting for permission";
  }
  if (agent.requiresAttention && agent.attentionReason === "error") return "Needs attention";
  if (agent.status === "running" || agent.status === "initializing") return "Working";
  if (agent.status === "error") return "Error";
  if (agent.status === "closed") return "Closed";
  return "Idle";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TeamPane() {
  const { board, hostId, workspaceId, pending } = useTeams();
  const { send } = useCommand();
  const s = useStyles();
  const [view, setView] = useDraft<TeamView>(draftKey(hostId, workspaceId, "team-view"), "list");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const openForm = useCallback(() => setAdding(true), []);
  const closeForm = useCallback(() => setAdding(false), []);
  const cancelRemove = useCallback(() => setRemoving(null), []);
  const askRemove = useCallback(
    (memberId: string) =>
      setRemoving(board.members.find((member) => member.id === memberId) ?? null),
    [board.members],
  );
  const remove = useCallback(async () => {
    if (!removing) return;
    if (await send({ kind: "removeMember", memberId: removing.id })) setRemoving(null);
  }, [removing, send]);
  const confirmRemove = useCallback(() => void remove(), [remove]);
  return (
    <View style={L.stack6}>
      <View style={L.betweenWrap}>
        <Tabs<TeamView>
          label="Team presentation"
          value={view}
          onChange={setView}
          tabs={VIEW_TABS}
        />
        <Button label="Link conversation" icon="Link" onPress={openForm} />
      </View>
      {board.members.length === 0 ? (
        <View style={L.empty}>
          <Text style={s.text}>No team members yet</Text>
          <Text style={s.small}>
            Link a conversation that already exists in this workspace and give it a role.
          </Text>
        </View>
      ) : null}
      {board.members.length > 0 && view === "list" ? <MemberList onRemove={askRemove} /> : null}
      {board.members.length > 0 && view === "map" ? <TeamMap /> : null}
      <Section title="This release">
        <Text style={s.small}>
          Teams links conversations that already exist in this workspace and tracks the work you
          assign. It does not create agents, spawn helpers or coordinate other computers.
        </Text>
      </Section>
      <AddMemberForm open={adding} onClose={closeForm} />
      <Confirm
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : "Remove member?"}
        confirmLabel="Remove from team"
        destructive
        busy={pending}
        onClose={cancelRemove}
        onConfirm={confirmRemove}
      >
        <Text style={s.text}>The linked conversation keeps running and is not deleted.</Text>
        <Text style={s.small}>Tasks this member owns may need a new owner.</Text>
      </Confirm>
    </View>
  );
}

function MemberList({ onRemove }: { onRemove(memberId: string): void }) {
  const { board } = useTeams();
  return (
    <Card>
      {board.members.map((member, index) => (
        <MemberRow key={member.id} member={member} first={index === 0} onRemove={onRemove} />
      ))}
    </Card>
  );
}

function MemberRow({
  member,
  first,
  onRemove,
}: {
  member: Member;
  first: boolean;
  onRemove(memberId: string): void;
}) {
  const { board, agents, agentsLoaded, openConversation } = useTeams();
  const s = useStyles();
  const agent = agents.get(member.agentId);
  const parent = board.members.find((candidate) => candidate.id === member.parentId)?.name;
  const open = useCallback(() => {
    if (agent && openConversation) openConversation(agent.id);
  }, [agent, openConversation]);
  const remove = useCallback(() => onRemove(member.id), [onRemove, member.id]);
  return (
    <Row first={first} layout="top">
      <Avatar name={member.name} />
      <View style={L.fill}>
        <Text style={s.text}>{member.name}</Text>
        <Text style={s.small}>{member.role}</Text>
        <Text style={s.small}>
          {agent?.title ?? "Linked conversation"}
          {parent ? ` · Reports to ${parent}` : ""}
        </Text>
        <View style={L.badgeRow}>
          <Badge label={agentStatus(agent, agentsLoaded)} tone={agentTone(agent)} />
        </View>
      </View>
      <View style={L.end}>
        {agent && openConversation ? (
          <Button variant="ghost" label="Open" a11yLabel={`Open ${agent.title}`} onPress={open} />
        ) : null}
        <Button
          variant="ghost"
          label="Remove"
          a11yLabel={`Remove ${member.name} from the team`}
          onPress={remove}
        />
      </View>
    </Row>
  );
}

function TeamMap() {
  const { board, agents, agentsLoaded } = useTeams();
  const s = useStyles();
  const tree = useMemo(() => memberTree(board.members), [board.members]);
  return (
    <View accessibilityLabel="Delegation map" style={s.map}>
      {tree.map(({ member, depth }) => {
        const agent = agents.get(member.agentId);
        const status = agentStatus(agent, agentsLoaded);
        const level = depth === 0 ? "lead" : `reports at level ${depth}`;
        return (
          <View
            key={member.id}
            accessibilityLabel={`${member.name}, ${level}, ${status}`}
            style={s.mapIndent[Math.min(depth, MAP_INDENT_LEVELS - 1)]}
          >
            {depth > 0 ? <View style={s.connector} /> : null}
            <View style={s.mapNode}>
              <Avatar name={member.name} />
              <View style={L.fill}>
                <Text style={s.text}>{member.name}</Text>
                <Text numberOfLines={1} style={s.small}>
                  {member.role}
                </Text>
              </View>
              <Badge label={status} tone={agentTone(agent)} />
            </View>
          </View>
        );
      })}
      <Text style={s.small}>Lines show who a member reports to. Roles do not grant access.</Text>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const s = useStyles();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={s.avatar}
    >
      <Text style={s.avatarText}>{initials(name)}</Text>
    </View>
  );
}

interface MemberDraft {
  name: string;
  role: string;
  agentId: string | null;
  parentId: string | null;
}

const EMPTY_MEMBER: MemberDraft = { name: "", role: "", agentId: null, parentId: null };
const NO_PARENT = "none";

function AddMemberForm({ open, onClose }: { open: boolean; onClose(): void }) {
  const { board, agents, agentsLoaded, hostId, workspaceId, pending } = useTeams();
  const { send, error, setError } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "new-member");
  const [draft, setDraft, discard] = useDraft<MemberDraft>(key, EMPTY_MEMBER);
  const [submitted, setSubmitted] = useState(false);
  const setName = useFieldSetter(setDraft, "name");
  const setRole = useFieldSetter(setDraft, "role");
  const setAgent = useCallback(
    (agentId: string) => setDraft((current) => ({ ...current, agentId })),
    [setDraft],
  );
  const setParent = useCallback(
    (value: string) =>
      setDraft((current) => ({ ...current, parentId: value === NO_PARENT ? null : value })),
    [setDraft],
  );
  const agentOptions = useMemo(() => {
    const linked = new Set(board.members.map((member) => member.agentId));
    return [...agents.values()].map((agent) => ({
      value: agent.id,
      label: agent.title,
      hint: linked.has(agent.id) ? "already on the team" : agent.provider,
    }));
  }, [agents, board.members]);
  const parentOptions = useMemo(
    () => [
      { value: NO_PARENT, label: "No one" },
      ...board.members.map((member) => ({ value: member.id, label: member.name })),
    ],
    [board.members],
  );
  const agentSelection = useMemo(() => (draft.agentId ? [draft.agentId] : []), [draft.agentId]);
  const parentSelection = useMemo(() => [draft.parentId ?? NO_PARENT], [draft.parentId]);
  const nameError = requiredText(draft.name, "a name");
  const roleError = requiredText(draft.role, "a role");
  const agentError = draft.agentId ? null : "Choose a conversation.";
  const reset = useCallback(() => {
    discard();
    setSubmitted(false);
    setError(null);
  }, [discard, setError]);
  const add = useCallback(async () => {
    setSubmitted(true);
    if (nameError || roleError || !draft.agentId) return;
    const saved = await send(
      {
        kind: "addMember",
        name: draft.name.trim(),
        role: draft.role.trim(),
        agentId: draft.agentId,
        parentId: draft.parentId,
      },
      [key],
    );
    if (!saved) return;
    setSubmitted(false);
    onClose();
  }, [nameError, roleError, draft, send, key, onClose]);
  const submit = useCallback(() => void add(), [add]);
  let conversations;
  if (agentOptions.length) {
    conversations = (
      <Choices
        label="Conversation"
        selected={agentSelection}
        options={agentOptions}
        onToggle={setAgent}
      />
    );
  } else {
    conversations = (
      <Text style={s.muted}>
        {agentsLoaded
          ? "No conversations in this workspace. Start one in Lyre, then link it here."
          : "Loading conversations..."}
      </Text>
    );
  }
  return (
    <Sheet title="Link conversation" open={open} onClose={onClose}>
      <Field
        label="Conversation"
        error={submitted ? agentError : null}
        hint="Only conversations already in this workspace"
      >
        {conversations}
      </Field>
      <Field label="Name" error={submitted ? nameError : null}>
        <Input
          label="Name"
          value={draft.name}
          maxLength={160}
          onChangeText={setName}
          placeholder="UI specialist"
        />
      </Field>
      <Field label="Role" error={submitted ? roleError : null} hint="What this member owns">
        <Input
          label="Role"
          value={draft.role}
          maxLength={160}
          onChangeText={setRole}
          placeholder="Owns readable layouts"
        />
      </Field>
      {board.members.length ? (
        <Field label="Reports to" hint="Shown in the team map. It grants no access.">
          <Choices
            label="Reports to"
            selected={parentSelection}
            options={parentOptions}
            onToggle={setParent}
          />
        </Field>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Text style={s.small}>Linking does not send anything to the conversation.</Text>
      <View style={s.actions}>
        <Button variant="ghost" label="Discard draft" onPress={reset} />
        <Button
          variant="primary"
          label="Add to team"
          busy={pending}
          busyLabel="Adding..."
          onPress={submit}
        />
      </View>
    </Sheet>
  );
}
