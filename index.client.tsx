import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TeamsPanel, TeamsScreen, clearAllDrafts } from "./client/index";

const PANEL_ID = "teams";
const SCREEN_ID = "teams";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addWorkspacePanel({
      id: PANEL_ID,
      title: "Teams",
      icon: "Users",
      context: "workspace",
      locations: ["workspace", "explorer"],
      Component: TeamsPanel,
    }),
    client.addScreen({ id: SCREEN_ID, title: "Teams", Component: TeamsScreen }),
    client.addCommandCenterItem({
      id: "open-teams",
      title: "Open Teams",
      icon: "Users",
      keywords: ["team", "tasks", "agents"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel(PANEL_ID);
      },
    }),
    client.addCommandCenterItem({
      id: "open-teams-screen",
      title: "Open Teams for a workspace",
      icon: "Users",
      keywords: ["team", "tasks"],
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: SCREEN_ID });
      },
    }),
    // Opens the panel only; the composer draft and conversation are untouched.
    client.addSlashCommand({
      name: "teams",
      description: "Open Teams for this workspace",
      argumentHint: "",
      context: "agent",
      onSubmit({ openPanel }) {
        openPanel(PANEL_ID);
      },
    }),
  ];
  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) void cleanups[index]?.();
    clearAllDrafts();
  };
}
