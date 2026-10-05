import { useCallback, useMemo } from "react";
import {
  Switch,
  Text,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from "react-native";
import { useCommand, useTeams } from "./context";
import { draftKey, useDraft } from "./drafts";
import { activeWorkers, requiredText } from "./model";
import { Button, Card, ErrorLine, Input, L, Row, Section, useStyles } from "./ui";

interface SettingsDraft {
  name: string;
  paused: boolean;
  maxWorkers: number;
}

const MIN_WORKERS = 1;
const MAX_WORKERS = 8;
const STEPPER_ACTIONS: AccessibilityActionInfo[] = [{ name: "increment" }, { name: "decrement" }];

function clamp(value: number): number {
  return Math.min(MAX_WORKERS, Math.max(MIN_WORKERS, value));
}

function savedSummary(saved: SettingsDraft): string {
  const slots = `${saved.maxWorkers} slot${saved.maxWorkers === 1 ? "" : "s"}`;
  return `Unsaved changes · Saved: ${slots}${saved.paused ? ", paused" : ""}`;
}

export function SettingsPane() {
  const { board, hostId, workspaceId, hostLabel, pending } = useTeams();
  const { send, error } = useCommand();
  const s = useStyles();
  const key = draftKey(hostId, workspaceId, "settings");
  const [draft, setDraft, discard] = useDraft<SettingsDraft | null>(key, null);
  const saved = useMemo<SettingsDraft>(
    () => ({ name: board.name, paused: board.paused, maxWorkers: board.maxWorkers }),
    [board.name, board.paused, board.maxWorkers],
  );
  const shown = draft ?? saved;
  // Background refreshes change `saved`, never a draft the person started.
  const edit = useCallback(
    (patch: Partial<SettingsDraft>) => setDraft((current) => ({ ...(current ?? saved), ...patch })),
    [setDraft, saved],
  );
  const setName = useCallback((name: string) => edit({ name }), [edit]);
  const setPaused = useCallback((paused: boolean) => edit({ paused }), [edit]);
  const step = useCallback(
    (action: string) => edit({ maxWorkers: clamp(shown.maxWorkers + (action === "up" ? 1 : -1)) }),
    [edit, shown.maxWorkers],
  );
  const stepAccessibly = useCallback(
    (event: AccessibilityActionEvent) =>
      step(event.nativeEvent.actionName === "increment" ? "up" : "down"),
    [step],
  );
  const stepperValue = useMemo(
    () => ({ min: MIN_WORKERS, max: MAX_WORKERS, now: shown.maxWorkers }),
    [shown.maxWorkers],
  );
  const dirty =
    draft !== null &&
    (draft.name.trim() !== saved.name ||
      draft.paused !== saved.paused ||
      draft.maxWorkers !== saved.maxWorkers);
  const nameError = requiredText(shown.name, "a team name");
  const inUse = activeWorkers(board);
  const save = useCallback(() => {
    if (nameError) return;
    void send(
      {
        kind: "configure",
        name: shown.name.trim(),
        paused: shown.paused,
        maxWorkers: shown.maxWorkers,
      },
      [key],
    );
  }, [nameError, send, shown, key]);
  let saveHint: string | undefined;
  if (!dirty) saveHint = "No unsaved changes";
  else if (nameError) saveHint = nameError;

  return (
    <View style={L.stack6}>
      <Section title="Team">
        <Card>
          <Row first layout="form">
            <View style={L.fill}>
              <Text style={s.text}>Name</Text>
              <Text style={s.small}>Shown in this workspace’s Teams panel</Text>
            </View>
            <View style={L.fill}>
              <Input label="Team name" value={shown.name} maxLength={160} onChangeText={setName} />
              {nameError ? <ErrorLine>{nameError}</ErrorLine> : null}
            </View>
          </Row>
          <Row>
            <View style={L.fill}>
              <Text style={s.text}>Pause team</Text>
              <Text style={s.small}>
                Stops new starts. Work already running continues in its conversation.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Pause team"
              value={shown.paused}
              onValueChange={setPaused}
              trackColor={s.trackColor}
            />
          </Row>
        </Card>
      </Section>
      <Section title="Work limits">
        <Card>
          <Row first>
            <View style={L.fill}>
              <Text style={s.text}>Worker slots</Text>
              <Text style={s.small}>
                Limits tasks started from Teams. {inUse} in use, including unconfirmed attempts.
                Lowering it never stops running work.
              </Text>
            </View>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Worker slots"
              accessibilityValue={stepperValue}
              accessibilityActions={STEPPER_ACTIONS}
              onAccessibilityAction={stepAccessibly}
              style={L.row}
            >
              <Button
                variant="outline"
                action="down"
                label="−"
                a11yLabel="Decrease worker slots"
                disabled={shown.maxWorkers <= MIN_WORKERS}
                onPress={step}
              />
              <Text style={s.stepperValue}>{shown.maxWorkers}</Text>
              <Button
                variant="outline"
                action="up"
                label="+"
                a11yLabel="Increase worker slots"
                disabled={shown.maxWorkers >= MAX_WORKERS}
                onPress={step}
              />
            </View>
          </Row>
          <Row>
            <View style={L.fill}>
              <Text style={s.text}>Provider helpers</Text>
              <Text style={s.small}>
                Helpers a provider creates inside a conversation are not limited by Teams
              </Text>
            </View>
          </Row>
          <Row>
            <View style={L.fill}>
              <Text style={s.text}>Final acceptance</Text>
              <Text style={s.small}>You record checks and accept results</Text>
            </View>
            <Text style={s.value}>Human review</Text>
          </Row>
          <Row>
            <View style={L.fill}>
              <Text style={s.text}>Scope</Text>
              <Text style={s.small}>This workspace on {hostLabel}</Text>
            </View>
          </Row>
        </Card>
      </Section>
      <View style={L.wrapCenter}>
        <Button
          variant="primary"
          label="Save settings"
          busy={pending}
          busyLabel="Saving..."
          disabled={!dirty || nameError !== null}
          hint={saveHint}
          onPress={save}
        />
        {draft ? <Button variant="ghost" label="Discard changes" onPress={discard} /> : null}
        <Text accessibilityLiveRegion="polite" style={s.small}>
          {dirty ? savedSummary(saved) : "All changes saved"}
        </Text>
      </View>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Text style={s.small}>
        Provider accounts, models and permissions stay in Lyre settings and each conversation.
      </Text>
    </View>
  );
}
