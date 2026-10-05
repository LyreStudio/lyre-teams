# Preview qualification

Version 0.1.0-preview.2, October 4, 2026. This source preview requires both
Lyre host and client >=0.1.7 <0.2.0 and real Teams storage support. It is unavailable
on 0.1.6; a changed version label does not add the required capability.

This version refines the interface after generating a desktop/phone concept:
quiet task rows and decision cards, clearer next actions, larger compact controls
and wrapped owner choices. Existing actions, drafts, permissions and review remain.
Opus 5.5 authored the initial client/design pass; it reached its session limit
before the concept-based follow-up, which the primary agent implemented.

Eight actual React Native web/catalog browser checks pass across desktop dark,
390px dark and 320px light. The real host text input is used; sheet/icon/toast
plumbing is injected. Draft retention through navigation and a deferred save,
uncertain-submission warnings, long names and empty/unavailable states are checked.
The service/runtime contracts are unchanged from independently reviewed preview.1.
Ten service regressions, 52 protocol compatibility tests, 24 renderer unit tests
and 46 host/authorization/isolated-daemon tests pass on the isolated host integration.
The daemon uses the existing fake provider and installs source copied outside
the development checkout, covering old-peer denial, dispatch, review and retained data.
Package types, scoped lint and static server/client compilation pass.

The isolated repository gate passes format, lint, foundation style, all workspace
types and architecture checks. Its later tooling stage fails the existing Vercel
upload-input assertion on a SheetJS license file. This preview is not a qualified
Lyre application binary or a green whole-application release. The wider upstream
source registry also retains baseline drift, separately recorded by the host worktree.

Installed Lyre 0.1.7, physical devices, enlarged native text, native sheets and live
accounts require separate host-release qualification. No live account or installed
user daemon was changed. Human acceptance never fabricates passing checks.

The inventory records exact runtime files, lengths and SHA-256 digests. The checksum
file binds the downloadable ZIP and inventory; published downloads are verified
against their frozen inputs. Any later changed bytes require another version.
