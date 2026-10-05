# Preview qualification

Version 0.1.0-preview.1, October 4, 2026. This source preview targets Lyre
0.1.7 through 0.1.x with Teams storage support on both host and client.
It is unavailable on 0.1.6. Changing a version label does not add the capability.

- Ten service regressions pass: scoped dispatch, capacity/revision/active-turn
  denial, lost submission/restart recovery, exact current-turn correlation,
  human evidence, retained attempts and durable workspace identity.
- Three browser cases render the real Teams React Native views at desktop and
  narrow widths in both product themes, with the real host text input. Drafts
  survive navigation and a delayed save; Unknown submission warns accurately.
  Empty, error and long-name states are checked. The host sheet/icon/toast shell
  is injected, so this does not qualify native navigation or text scaling.
- A real isolated daemon uses the existing fake provider for explicit dispatch,
  observed completion, unchecked criteria and human acceptance. Old-host install
  and old-client catalog/RPC denial, persistence and removal retention pass.
- Strict package types, scoped lint and static client/server compilation pass.
- An independent source review required and verified corrections to historical
  turn attribution, draft clearing during saves uncertain-submission copy and reassigned Planned-task conversation navigation.

No live provider account or installed user daemon was changed. Installed Lyre
0.1.7, physical phones, enlarged native text and live account execution require
separate host-release qualification. The main application repository gate
stopped on an unrelated Android upload script formatting failure; this preview
is not a qualified application binary or a green whole-application release.

The ZIP inventory records the exact runtime files, byte sizes and SHA-256 digests.
SHA256SUMS binds the downloadable ZIP and inventory. Source tests are retained
in this repository; develop from a Lyre checkout with its prepared SDK modules.
