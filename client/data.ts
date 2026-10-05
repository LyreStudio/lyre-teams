import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { changeTeams, readTeams, type Board, type Command } from "../shared/actions";
import { clearDraftIfUnchanged, draftVersion } from "./drafts";
import type { LinkedAgent } from "./model";

const WORKING_REFRESH_MS = 10_000;

export function boardQueryKey(hostId: string, workspaceId: string) {
  return ["lyre-teams", "board", hostId, workspaceId] as const;
}

/** A response never replaces a newer revision already shown for the same workspace. */
function newer(previous: Board | undefined, next: Board): Board {
  return previous && previous.revision > next.revision ? previous : next;
}

export function useBoard(hostId: string, workspaceId: string) {
  const read = useRpc(readTeams);
  const cache = useQueryClient();
  const queryKey = boardQueryKey(hostId, workspaceId);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const board = await read({ workspaceId });
      if (board.workspaceId !== workspaceId) {
        throw new Error("TEAMS_WORKSPACE_MISMATCH: The computer answered for another workspace.");
      }
      return newer(cache.getQueryData<Board>(queryKey), board);
    },
    retry: false,
    // Refresh only while an attempt can still finish on the host; react-query pauses when hidden.
    refetchInterval: (query) =>
      query.state.data?.tasks.some(
        (task) =>
          task.status === "working" || task.status === "unknown" || task.delivery === "submitting",
      )
        ? WORKING_REFRESH_MS
        : false,
  });
}

export interface ChangeInput {
  revision: number;
  command: Command;
  /** Cleared only after the host confirms the change. */
  draftKeys?: readonly string[];
}

export function useChangeBoard(hostId: string, workspaceId: string) {
  const change = useRpc(changeTeams);
  const cache = useQueryClient();
  return useMutation({
    onMutate: (input: ChangeInput) =>
      new Map((input.draftKeys ?? []).map((key) => [key, draftVersion(key)])),
    mutationFn: async ({ revision, command }: ChangeInput) => {
      const board = await change({ workspaceId, revision, command });
      if (board.workspaceId !== workspaceId) {
        throw new Error("TEAMS_WORKSPACE_MISMATCH: The computer answered for another workspace.");
      }
      return board;
    },
    onSuccess: (board, input, submittedDrafts) => {
      cache.setQueryData<Board>(boardQueryKey(hostId, workspaceId), (previous) =>
        newer(previous, board),
      );
      for (const key of input.draftKeys ?? []) {
        const version = submittedDrafts?.get(key);
        if (version !== undefined) clearDraftIfUnchanged(key, version);
      }
    },
    onError: () => {
      // The revision may be stale or the outcome uncertain; show what the host has now.
      void cache.invalidateQueries({ queryKey: boardQueryKey(hostId, workspaceId) });
    },
  });
}

/** Existing conversations in this workspace. Teams links them; it never creates agents. */
export function useWorkspaceAgents(hostId: string, workspaceId: string) {
  const paseo = usePaseo();
  const query = useQuery({
    queryKey: ["lyre-teams", "agents", hostId, workspaceId],
    queryFn: async (): Promise<LinkedAgent[]> => {
      const result = await paseo.agents.list({ scope: "active", page: { limit: 200 } });
      return result.entries
        .map((entry) => entry.agent)
        .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt)
        .map((agent) => ({
          id: agent.id,
          title: agent.title?.trim() || "Untitled conversation",
          provider: agent.provider,
          status: agent.status,
          requiresAttention: agent.requiresAttention ?? false,
          attentionReason: agent.attentionReason ?? null,
        }));
    },
    retry: false,
    staleTime: 5_000,
  });
  const byId = useMemo(
    () => new Map((query.data ?? []).map((agent) => [agent.id, agent] as const)),
    [query.data],
  );
  return { ...query, byId };
}
