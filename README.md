# Lyre Teams

Coordinate your agents. Keep assignments, questions and review evidence together.

Lyre Teams adds a workspace panel with a task list, an attention view, a team list
and optional hierarchy map. Link the conversations already working in a workspace,
give each member a role, and start assignments when you are ready. Teams preserves
its records locally on the computer doing the work.

## Compatibility

This is **0.1.0-preview.2**, an early downloadable preview for **Lyre 0.1.7** with
Teams storage support. Both the host computer and viewing client must run a
compatible version. Lyre 0.1.6 is incompatible: the listing stays hidden, and
installation or loading is rejected. Changing a version label alone does not add
the required host capability.

The foundation SDK requirement is separate: `>=0.11.0-beta.3 <0.12.0`.
The supported Lyre product range is `>=0.1.7 <0.2.0`. A later product series needs
a newly qualified extension release. Unknown versions and unsupported capabilities
fail closed. This preview does not claim acceptance on an installed 0.1.7 release
before that host release exists.

## Installation

1. Download `lyre-teams-0.1.0-preview.2.zip` and `SHA256SUMS` from this repository's
   [preview release](https://github.com/LyreStudio/lyre-teams/releases/tag/v0.1.0-preview.2).
2. Check the ZIP's SHA-256 against `SHA256SUMS` before extracting. On Windows use
   `Get-FileHash -Algorithm SHA256`; on macOS use `shasum -a 256`.
3. Extract into a permanent folder on the Lyre host computer. Keep that folder;
   directory plugins run from their installed source.
4. In the compatible host's **Settings → Plugins**, install the extracted folder
   using the existing local directory installation flow. Review the source first.
   This is trusted, unsandboxed code with the host user's machine access.
5. If plugins are disabled, use the existing explicit enablement control. Enabling
   the global switch also activates other enabled plugins configured on that host.
6. Open a workspace, then open its **Teams** panel. The Command Center and `/teams`
   open the same work. Downloading or browsing a listing starts no agents.

The host CLI can also install the folder with `lyre-foundation plugin install
/absolute/path/to/lyre-teams`. Use the CLI supplied with that host release;
installing a different CLI does not upgrade the running host.

## Using Teams

- **Team:** link existing conversations in the selected workspace; name their roles
  and optionally select another member as their coordinator. Teams uses Lyre's
  existing provider choices, permission flows, worktrees and conversation history.
- **Tasks:** create an assignment, choose its owner, add acceptance criteria and
  optional dependencies on existing tasks. A new task starts as Planned.
- **Start assignment:** explicitly send the task to its linked conversation. Teams
  checks scope, dependencies, pause state, existing active turns and worker capacity.
  It does not create new agents or grant project access.
- **Attention:** see unanswered recorded questions, results ready for review and
  failed or uncertain attempts. Open a linked conversation to handle provider
  permissions, account usage, live tools and follow-up messages through Lyre.
- **Review:** record the result and the evidence for each check. Checks start as
  Not checked. Human acceptance never silently changes them to Passed.
- **Settings:** name the team, pause new dispatch, and choose up to eight concurrent
  Teams assignments. The default is one. This controls work dispatched through
  Teams; it is not a provider billing limit or an operating-system sandbox.
- **Stop assignment:** use the host's existing cancellation operation. A retry is
  refused while the previous conversation is still running.

Recorded answers are saved decisions, not proof of model delivery. Include them
in the next explicitly started assignment or send a follow-up in the conversation.
Provider submission is distinct from an observed completed turn. If confirmation
is lost or the extension restarts, inspect the conversation before retrying;
Teams never automatically replays an uncertain prompt.

## Preview scope and retained data

This version supports owner-managed teams on one host, with up to 20 linked members
and 100 retained tasks per workspace. It does not provide autonomous delegation,
agent-addressable mail, cross-computer background coordination, automatic test
verification, provider account fallback, or a new permission system. The optional
map shows the roster relationship selected by the owner.

Closing Teams or disabling/removing the plugin stops its dispatch and UI, while
host-owned conversations remain accessible in Lyre. It does not automatically stop
those agents. Use Stop before removal if you want work to end first. Versioned team
records stay under the host-owned `plugin-data/lyre-teams` directory and are retained
on removal. Deleting that data is a separate manual action. Project files are never
stored or read by this extension; conversation work retains its existing scope.

## Development

The source uses the host-provided React Native, Zod, TanStack Query and Lyre plugin
SDK modules. No Python, database server, provider runtime or model credentials are
included in this download. The host compiles its TypeScript entries in memory.

From the Lyre source checkout, typecheck this package and run its `tests/` suite.
Use the host's static `plugin check` with `--lyre-version 0.1.7` when checking the
future target. A static check compiles imports; it does not qualify a running host.

Licensed under MIT. Host-provided dependencies retain their own licenses.
