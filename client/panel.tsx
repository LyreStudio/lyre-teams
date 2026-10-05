import { useWorkspace, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { TeamsView } from "./view";

/** Primary entry: the Teams panel beside the workspace's conversations and preview. */
export function TeamsPanel({
  theme,
  layout,
  host,
  navigation,
  workspaceId,
}: PluginWorkspacePanelProps) {
  const name = useWorkspace(workspaceId, (workspace) => workspace.name);
  return (
    <TeamsView
      key={`${host.id}:${workspaceId}`}
      theme={theme}
      compact={layout.compact}
      host={host}
      navigation={navigation}
      workspaceId={workspaceId}
      workspaceLabel={name}
    />
  );
}
