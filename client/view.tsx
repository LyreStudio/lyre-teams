import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import type { Board, Command } from "../shared/actions";
import { AttentionPane, useAttention } from "./attention";
import { TeamsContext, useTeams, type TeamsContextValue } from "./context";
import { useBoard, useChangeBoard, useWorkspaceAgents } from "./data";
import { draftKey, useDraft } from "./drafts";
import { errorText } from "./model";
import { SettingsPane } from "./settings";
import { TasksPane } from "./tasks";
import { TeamPane } from "./team";
import {
  Badge,
  Button,
  ErrorLine,
  L,
  Notice,
  StylesProvider,
  Tabs,
  useStyles,
  type TabOption,
} from "./ui";

type Destination = "tasks" | "attention" | "team" | "settings";

const SPLIT_WIDTH = 760;

const SAVED_MESSAGE: Partial<Record<Command["kind"], string>> = {
  addTask: "Task created. No work started.",
  addMember: "Conversation linked",
  removeMember: "Member removed",
  start: "Assignment submitted",
  answer: "Answer saved",
  question: "Question saved",
  review: "Result submitted for review",
  accept: "Result accepted",
  retry: "Task planned for another attempt",
  cancel: "Stopped and canceled",
  configure: "Settings saved",
};

export interface TeamsViewProps {
  theme: PluginTheme;
  compact: boolean;
  host: { id: string; label: string };
  navigation: PluginSurfaceProps["navigation"];
  workspaceId: string;
  /** Workspace name from client state when known. */
  workspaceLabel: string | null;
  /** Shown on the screen surface to return to its workspace picker. */
  onChooseWorkspace?: () => void;
}

export function TeamsView(props: TeamsViewProps) {
  return (
    <StylesProvider theme={props.theme} compact={props.compact}>
      <TeamsBody {...props} />
    </StylesProvider>
  );
}

function TeamsBody({
  host,
  navigation,
  workspaceId,
  workspaceLabel,
  onChooseWorkspace,
}: TeamsViewProps) {
  const s = useStyles();
  const toast = useToast();
  const board = useBoard(host.id, workspaceId);
  const agents = useWorkspaceAgents(host.id, workspaceId);
  const change = useChangeBoard(host.id, workspaceId);
  const [width, setWidth] = useState(0);
  const [changeError, setChangeError] = useState<string | null>(null);
  const data = board.data;
  const mutateAsync = change.mutateAsync;
  const refetchBoard = board.refetch;
  const refetchAgents = agents.refetch;

  const run = useCallback(
    async (command: Command, draftKeys?: readonly string[]): Promise<Board | null> => {
      if (!data) return null;
      try {
        const saved = await mutateAsync({ revision: data.revision, command, draftKeys });
        setChangeError(null);
        const message = SAVED_MESSAGE[command.kind];
        if (
          command.kind === "start" &&
          saved.tasks.find((task) => task.id === command.taskId)?.delivery === "unknown"
        ) {
          toast.show("Submission uncertain. Inspect the conversation before retrying.", {
            variant: "warning",
          });
        } else if (message) toast.show(message, { variant: "success" });
        return saved;
      } catch (error) {
        setChangeError(
          `TEAMS_CHANGE_FAILED: ${errorText(error)} The latest team is reloaded and your input is kept.`,
        );
        return null;
      }
    },
    [data, mutateAsync, toast],
  );

  const openAgent = navigation?.openAgent;
  const openConversation = useMemo(
    () => (openAgent ? (agentId: string) => openAgent({ agentId, serverId: host.id }) : null),
    [openAgent, host.id],
  );

  const context = useMemo<TeamsContextValue | null>(
    () =>
      data
        ? {
            hostId: host.id,
            hostLabel: host.label,
            workspaceId,
            board: data,
            agents: agents.byId,
            agentsLoaded: !agents.isPending,
            run,
            pending: change.isPending,
            openConversation,
          }
        : null,
    [
      data,
      host.id,
      host.label,
      workspaceId,
      agents.byId,
      agents.isPending,
      run,
      change.isPending,
      openConversation,
    ],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const refresh = useCallback(() => {
    void refetchBoard();
    void refetchAgents();
  }, [refetchBoard, refetchAgents]);

  return (
    <View style={s.root} onLayout={onLayout}>
      <View style={s.header}>
        <TeamsHeader
          title={data?.name ?? "Teams"}
          place={[workspaceLabel, host.label].filter(Boolean).join(" · ")}
          paused={data?.paused ?? false}
          refreshing={board.isFetching}
          onRefresh={refresh}
        />
        {onChooseWorkspace ? (
          <Button
            variant="ghost"
            icon="ChevronLeft"
            label="All workspaces"
            onPress={onChooseWorkspace}
            style={L.startOnRail}
          />
        ) : null}
        {context ? (
          <TeamsContext.Provider value={context}>
            <DestinationTabs />
          </TeamsContext.Provider>
        ) : null}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={L.flexOne}
        contentContainerStyle={s.content}
      >
        <StatusLines
          loading={board.isPending}
          readError={board.error}
          hasData={data !== undefined}
          changeError={changeError}
          agentsFailed={agents.error !== null}
          hostLabel={host.label}
          onRetry={refresh}
        />
        {context ? (
          <TeamsContext.Provider value={context}>
            <DestinationContent split={width >= SPLIT_WIDTH} />
          </TeamsContext.Provider>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TeamsHeader({
  title,
  place,
  paused,
  refreshing,
  onRefresh,
}: {
  title: string;
  place: string;
  paused: boolean;
  refreshing: boolean;
  onRefresh(): void;
}) {
  const s = useStyles();
  return (
    <View style={L.row}>
      <View style={L.fill}>
        <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={s.small}>
          {place}
        </Text>
      </View>
      {paused ? <Badge label="Paused" tone="warning" /> : null}
      <Button
        variant="ghost"
        icon="RefreshCw"
        label={s.compact ? "" : "Refresh"}
        a11yLabel="Refresh team"
        busy={refreshing}
        busyLabel={s.compact ? "" : "Refreshing..."}
        onPress={onRefresh}
      />
    </View>
  );
}

function StatusLines({
  loading,
  readError,
  hasData,
  changeError,
  agentsFailed,
  hostLabel,
  onRetry,
}: {
  loading: boolean;
  readError: Error | null;
  hasData: boolean;
  changeError: string | null;
  agentsFailed: boolean;
  hostLabel: string;
  onRetry(): void;
}) {
  const s = useStyles();
  return (
    <>
      {loading ? <Text style={s.muted}>Loading team...</Text> : null}
      {readError && !hasData ? (
        <Notice tone="danger" title="Teams is unavailable on this computer">
          <Text selectable style={s.muted}>
            TEAMS_READ_FAILED: {errorText(readError)}
          </Text>
          <Text style={s.small}>
            Check that Lyre Teams is installed and enabled on {hostLabel}, then retry.
          </Text>
          <Button label="Retry" onPress={onRetry} style={L.start} />
        </Notice>
      ) : null}
      {readError && hasData ? (
        <ErrorLine>Could not refresh. Showing the last loaded team.</ErrorLine>
      ) : null}
      {changeError ? <ErrorLine>{changeError}</ErrorLine> : null}
      {agentsFailed ? (
        <Text style={s.small}>
          Conversation status is unavailable. Task records are unaffected.
        </Text>
      ) : null}
    </>
  );
}

function useDestination() {
  const { hostId, workspaceId } = useTeamsKeys();
  return useDraft<Destination>(draftKey(hostId, workspaceId, "tab"), "tasks");
}

function useSelectedTask() {
  const { hostId, workspaceId } = useTeamsKeys();
  return useDraft<string | null>(draftKey(hostId, workspaceId, "selected"), null);
}

function useTeamsKeys() {
  const { hostId, workspaceId } = useTeams();
  return { hostId, workspaceId };
}

function DestinationTabs() {
  const [tab, setTab] = useDestination();
  const attention = useAttention().length;
  const tabs = useMemo<readonly TabOption<Destination>[]>(
    () => [
      { value: "tasks", label: "Tasks" },
      { value: "attention", label: "Attention", count: attention },
      { value: "team", label: "Team" },
      { value: "settings", label: "Settings" },
    ],
    [attention],
  );
  return <Tabs<Destination> label="Teams destinations" value={tab} onChange={setTab} tabs={tabs} />;
}

function DestinationContent({ split }: { split: boolean }) {
  const [tab, setTab] = useDestination();
  const [selected, setSelected] = useSelectedTask();
  const openTask = useCallback(
    (taskId: string) => {
      setSelected(taskId);
      setTab("tasks");
    },
    [setSelected, setTab],
  );
  switch (tab) {
    case "attention":
      return <AttentionPane onOpenTask={openTask} />;
    case "team":
      return <TeamPane />;
    case "settings":
      return <SettingsPane />;
    default:
      return <TasksPane selectedId={selected} onSelect={setSelected} split={split} />;
  }
}
