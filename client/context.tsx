import { createContext, useCallback, useContext, useState } from "react";
import type { Board, Command } from "../shared/actions";
import { parseCommand, type LinkedAgent } from "./model";

export interface TeamsContextValue {
  hostId: string;
  hostLabel: string;
  workspaceId: string;
  board: Board;
  agents: ReadonlyMap<string, LinkedAgent>;
  agentsLoaded: boolean;
  /** Sends one validated command against the shown revision. Resolves the saved board or null. */
  run(command: Command, draftKeys?: readonly string[]): Promise<Board | null>;
  pending: boolean;
  /** Present only when the host app supplies client navigation. */
  openConversation: ((agentId: string) => void) | null;
}

export const TeamsContext = createContext<TeamsContextValue | null>(null);

export function useTeams(): TeamsContextValue {
  const value = useContext(TeamsContext);
  if (!value) throw new Error("Lyre Teams context is unavailable");
  return value;
}

/**
 * Validates a command against the shared schema before sending it, so a value shown as valid
 * is exactly what the host receives. Host failures surface in the view's error line.
 */
export function useCommand() {
  const { run } = useTeams();
  const [error, setError] = useState<string | null>(null);
  const send = useCallback(
    async (command: Command, draftKeys?: readonly string[]) => {
      const parsed = parseCommand(command);
      if (!parsed.ok) {
        setError(parsed.message);
        return null;
      }
      setError(null);
      return run(parsed.command, draftKeys);
    },
    [run],
  );
  return { send, error, setError };
}
