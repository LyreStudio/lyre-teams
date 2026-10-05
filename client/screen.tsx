import { useQuery } from "@tanstack/react-query";
import { usePaseo, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { draftKey, useDraft } from "./drafts";
import { errorText } from "./model";
import { Button, Card, Chevron, ErrorLine, L, PressRow, StylesProvider, useStyles } from "./ui";
import { TeamsView } from "./view";

interface ChosenWorkspace {
  id: string;
  name: string;
}

interface WorkspaceChoice extends ChosenWorkspace {
  project: string;
}

/** Screen entry: opens the given workspace, or asks which existing workspace to use. */
export function TeamsScreen({ theme, layout, host, navigation, params }: PluginScreenProps) {
  const [chosen, setChosen] = useDraft<ChosenWorkspace | null>(
    draftKey(host.id, "", "screen-workspace", params.workspaceId ?? ""),
    null,
  );
  const choose = useCallback(() => setChosen(null), [setChosen]);
  const workspaceId = chosen?.id ?? params.workspaceId ?? null;
  if (workspaceId) {
    return (
      <TeamsView
        key={`${host.id}:${workspaceId}`}
        theme={theme}
        compact={layout.compact}
        host={host}
        navigation={navigation}
        workspaceId={workspaceId}
        workspaceLabel={chosen?.name ?? null}
        onChooseWorkspace={chosen ? choose : undefined}
      />
    );
  }
  return (
    <StylesProvider theme={theme} compact={layout.compact}>
      <WorkspacePicker hostId={host.id} hostLabel={host.label} onChoose={setChosen} />
    </StylesProvider>
  );
}

function WorkspacePicker({
  hostId,
  hostLabel,
  onChoose,
}: {
  hostId: string;
  hostLabel: string;
  onChoose(workspace: ChosenWorkspace): void;
}) {
  const s = useStyles();
  const paseo = usePaseo();
  const workspaces = useQuery({
    queryKey: ["lyre-teams", "workspaces", hostId],
    queryFn: async (): Promise<WorkspaceChoice[]> => {
      const result = await paseo.workspaces.list({
        sort: [{ key: "activity_at", direction: "desc" }],
        page: { limit: 100 },
      });
      return result.entries
        .filter((workspace) => !workspace.archivingAt)
        .map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          project: workspace.projectDisplayName,
        }));
    },
    retry: false,
  });
  const refetch = workspaces.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const pick = useCallback(
    (id: string) => {
      const workspace = workspaces.data?.find((candidate) => candidate.id === id);
      if (workspace) onChoose({ id: workspace.id, name: workspace.name });
    },
    [workspaces.data, onChoose],
  );
  return (
    <ScrollView style={s.root} contentContainerStyle={s.pickerContent}>
      <View style={L.stack1}>
        <Text accessibilityRole="header" style={s.title}>
          Choose a workspace
        </Text>
        <Text style={s.small}>Teams keeps tasks for one workspace on {hostLabel}.</Text>
      </View>
      {workspaces.isPending ? <Text style={s.muted}>Loading workspaces...</Text> : null}
      {workspaces.error ? (
        <View style={L.stack2}>
          <ErrorLine>TEAMS_WORKSPACES_FAILED: {errorText(workspaces.error)}</ErrorLine>
          <Button label="Retry" onPress={retry} style={L.start} />
        </View>
      ) : null}
      {workspaces.data?.length === 0 ? (
        <Text style={s.muted}>
          No workspaces on this computer yet. Add a project in Lyre first.
        </Text>
      ) : null}
      {workspaces.data?.length ? (
        <Card>
          {workspaces.data.map((workspace, index) => (
            <PressRow
              key={workspace.id}
              first={index === 0}
              value={workspace.id}
              label={`${workspace.name}, ${workspace.project}`}
              hint="Opens Teams for this workspace"
              onPress={pick}
            >
              <View style={L.fill}>
                <Text style={s.text}>{workspace.name}</Text>
                <Text style={s.small}>{workspace.project}</Text>
              </View>
              <Chevron />
            </PressRow>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
