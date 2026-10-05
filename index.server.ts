import type { PluginServerContext } from "@getpaseo/plugin/server";
import { changeTeams, readTeams } from "./shared/actions";
import { createBoardStore } from "./server/store";
import { createTeamService } from "./server/service";

export default function contribute(server: PluginServerContext) {
  // Older runtimes cannot inject a private data owner. Fail before registering or touching disk.
  if (!server.host?.dataDirectory)
    throw new Error("TEAMS_HOST_UNSUPPORTED: Lyre 0.1.7 with Teams storage support is required.");
  const service = createTeamService(createBoardStore(server.host.dataDirectory));
  server.handle(readTeams, (input, { paseo }) => service.read(input.workspaceId, paseo));
  server.handle(changeTeams, (input, { paseo }) =>
    service.change(input.workspaceId, input.revision, input.command, paseo),
  );
  const remove = server.on("agent.turn_ended", (event) => service.ended(event));
  return async () => {
    remove();
    await service.dispose();
  };
}
