import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { boardSchema, type Board } from "../shared/actions";

export interface BoardStore {
  read(workspaceId: string, projectId: string): Promise<Board>;
  write(board: Board): Promise<void>;
}

/** The host supplies this private root; workspace input never becomes a path. */
export function createBoardStore(root: string): BoardStore {
  const location = (workspaceId: string) =>
    path.join(root, `${createHash("sha256").update(workspaceId).digest("hex")}.json`);
  return {
    async read(workspaceId, projectId) {
      const file = location(workspaceId);
      const info = await stat(file).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (!info)
        return {
          revision: 0,
          workspaceId,
          projectId,
          name: "My team",
          paused: false,
          maxWorkers: 1,
          members: [],
          tasks: [],
        };
      if (info.size > 2 * 1024 * 1024)
        throw new Error("TEAMS_DATA_LIMIT: The saved team exceeds the supported size.");
      const document = JSON.parse(await readFile(file, "utf8"));
      if (document.version !== 1)
        throw new Error("TEAMS_DATA_VERSION: Update the extension to read this team.");
      const board = boardSchema.parse(document.board);
      if (board.workspaceId !== workspaceId || board.projectId !== projectId)
        throw new Error("TEAMS_SCOPE_DENIED: This team belongs to another workspace.");
      return board;
    },
    async write(board) {
      const serialized = JSON.stringify({ version: 1, board: boardSchema.parse(board) });
      if (Buffer.byteLength(serialized) > 2 * 1024 * 1024)
        throw new Error("TEAMS_DATA_LIMIT: Shorten the team's retained text.");
      await mkdir(root, { recursive: true, mode: 0o700 });
      const file = location(board.workspaceId);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, serialized, { mode: 0o600, flag: "wx" });
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}
