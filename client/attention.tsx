import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTeams } from "./context";
import {
  ATTENTION_LABEL,
  attentionEntries,
  type AttentionEntry,
  type AttentionKind,
  type Tone,
} from "./model";
import { Card, Chevron, Dot, L, PressRow, Section, useStyles } from "./ui";

const ORDER: readonly AttentionKind[] = ["question", "permission", "review", "failed", "unknown"];
const TONE: Record<AttentionKind, Tone> = {
  question: "warning",
  permission: "warning",
  review: "success",
  failed: "danger",
  unknown: "warning",
};

export function useAttention(): AttentionEntry[] {
  const { board, agents } = useTeams();
  return useMemo(() => attentionEntries(board, agents), [board, agents]);
}

export function AttentionPane({ onOpenTask }: { onOpenTask(taskId: string): void }) {
  const { agentsLoaded } = useTeams();
  const s = useStyles();
  const entries = useAttention();
  const groups = ORDER.map((kind) => ({
    kind,
    entries: entries.filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0);
  return (
    <View style={L.stack6}>
      {groups.length === 0 ? (
        <View style={L.emptyCenter}>
          <Text style={s.text}>You’re up to date</Text>
          <Text style={s.smallCenter}>Questions, review requests and failed work appear here.</Text>
        </View>
      ) : null}
      {groups.map((group) => (
        <Section
          key={group.kind}
          title={ATTENTION_LABEL[group.kind]}
          trailing={String(group.entries.length)}
        >
          <Card>
            {group.entries.map((entry, index) => (
              <AttentionRow
                key={entry.key}
                entry={entry}
                first={index === 0}
                onOpenTask={onOpenTask}
              />
            ))}
          </Card>
        </Section>
      ))}
      <Text style={s.small}>
        Viewing this list does not resolve anything. Provider permission requests are answered in
        their conversation.
        {agentsLoaded ? "" : " Conversation status is still loading."}
      </Text>
    </View>
  );
}

function AttentionRow({
  entry,
  first,
  onOpenTask,
}: {
  entry: AttentionEntry;
  first: boolean;
  onOpenTask(taskId: string): void;
}) {
  const { openConversation } = useTeams();
  const s = useStyles();
  const canOpen = entry.taskId !== null || (entry.agentId !== null && openConversation !== null);
  const open = useCallback(() => {
    if (entry.taskId) onOpenTask(entry.taskId);
    else if (entry.agentId && openConversation) openConversation(entry.agentId);
  }, [entry.taskId, entry.agentId, onOpenTask, openConversation]);
  const body = (
    <>
      <Dot tone={TONE[entry.kind]} />
      <View style={L.fill}>
        <Text style={s.text}>{entry.title}</Text>
        <Text numberOfLines={2} style={s.small}>
          {entry.detail}
        </Text>
      </View>
    </>
  );
  if (!canOpen) return <View style={s.rows.center[first ? 0 : 1]}>{body}</View>;
  return (
    <PressRow
      first={first}
      label={`${entry.title}. ${entry.detail}`}
      hint={entry.taskId ? "Opens the task" : "Opens the conversation"}
      onPress={open}
    >
      {body}
      <Chevron />
    </PressRow>
  );
}
