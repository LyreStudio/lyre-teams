import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { Tone } from "./model";

// Lyre spacing steps; values outside this scale are intentionally absent.
export const space = { 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

/** Theme-independent layout. Themed values live in `useStyles()`. */
export const L = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  wrapCenter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[3] },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  betweenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  fill: { flex: 1, minWidth: 0, gap: 2 },
  end: { gap: space[1], alignItems: "flex-end" },
  stack1: { gap: space[1] },
  stack15: { gap: space[1.5] },
  stack2: { gap: space[2] },
  stack3: { gap: space[3] },
  stack4: { gap: space[4] },
  stack6: { gap: space[6] },
  start: { alignSelf: "flex-start" },
  // Ghost buttons keep their label on the text rail; the hit area extends left of it.
  startOnRail: { alignSelf: "flex-start", marginLeft: -space[3] },
  empty: { paddingVertical: space[6], gap: space[1] },
  emptyCenter: { paddingVertical: space[8], alignItems: "center", gap: space[1] },
  split: { flexDirection: "row", gap: space[6], alignItems: "flex-start" },
  listColumn: { width: 320, flexShrink: 1 },
  detailColumn: { flex: 1, minWidth: 0, maxWidth: 720 },
  groupHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space[1],
  },
  flexOne: { flex: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
});

const TONES: readonly Tone[] = ["neutral", "accent", "success", "warning", "danger"];
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "outline", "ghost", "danger"];
export type RowLayout = "center" | "top" | "stack" | "form";
const ROW_LAYOUTS: readonly RowLayout[] = ["center", "top", "stack", "form"];
export const MAP_INDENT_LEVELS = 5;

function toneColor(colors: PluginTheme["colors"], tone: Tone): string {
  switch (tone) {
    case "success":
      return colors.statusSuccess;
    case "warning":
      return colors.statusWarning;
    case "danger":
      return colors.statusDanger;
    case "accent":
      return colors.accent;
    default:
      return colors.foregroundMuted;
  }
}

function perKey<Key extends string, Value>(
  keys: readonly Key[],
  make: (key: Key) => Value,
): Record<Key, Value> {
  return Object.fromEntries(keys.map((key) => [key, make(key)])) as Record<Key, Value>;
}

function buttonFill(colors: PluginTheme["colors"], variant: ButtonVariant): ViewStyle {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.accent, borderColor: "transparent" };
    case "secondary":
      return { backgroundColor: colors.surface2, borderColor: "transparent" };
    case "ghost":
      return { backgroundColor: "transparent", borderColor: "transparent" };
    default:
      return { backgroundColor: "transparent", borderColor: colors.border };
  }
}

function buttonText(colors: PluginTheme["colors"], variant: ButtonVariant): string {
  if (variant === "primary") return colors.accentForeground;
  if (variant === "danger") return colors.statusDanger;
  return colors.foreground;
}

function buildStyles(theme: PluginTheme, compact: boolean) {
  const c = theme.colors;
  const control = compact ? 44 : 32;
  const gutter = compact ? space[4] : space[6];
  const text: TextStyle = { color: c.foreground, fontSize: 14, lineHeight: 20 };
  const small: TextStyle = { color: c.foregroundMuted, fontSize: 12, lineHeight: 16 };
  const muted: TextStyle = { ...text, color: c.foregroundMuted };
  const border: ViewStyle = { borderTopWidth: 1, borderTopColor: c.border };
  const center: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: compact ? space[3] : space[4],
    paddingVertical: space[3],
    minHeight: 48,
  };
  const stack: ViewStyle = {
    ...center,
    flexDirection: "column",
    alignItems: "stretch",
    gap: space[2],
  };
  const layouts: Record<RowLayout, ViewStyle> = {
    center,
    top: { ...center, alignItems: "flex-start" },
    stack,
    form: compact ? stack : center,
  };
  const button: ViewStyle = {
    minHeight: control,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
  };
  const input: TextStyle = {
    ...text,
    backgroundColor: c.surface0,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: control + 4,
  };
  const chip: ViewStyle = {
    minHeight: compact ? 44 : 32,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: "transparent",
  };
  const tab: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1.5],
    minHeight: compact ? 44 : 32,
    paddingHorizontal: compact ? space[2] : space[3],
    borderRadius: 8,
  };
  const panel: ViewStyle = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surface1,
  };
  return {
    colors: c,
    compact,
    root: { flex: 1, backgroundColor: c.surface0 } satisfies ViewStyle,
    text,
    textMedium: { ...text, fontWeight: "500" } satisfies TextStyle,
    textFill: { ...text, flex: 1 } satisfies TextStyle,
    muted,
    small,
    smallCenter: { ...small, textAlign: "center" } satisfies TextStyle,
    smallDanger: { ...small, color: c.statusDanger } satisfies TextStyle,
    value: { ...muted, textAlign: "right" } satisfies TextStyle,
    warningValue: { ...muted, color: c.statusWarning, textAlign: "right" } satisfies TextStyle,
    title: { ...text, fontSize: 16, lineHeight: 22, fontWeight: "500" } satisfies TextStyle,
    detailTitle: { ...text, fontSize: 18, lineHeight: 24, fontWeight: "500" } satisfies TextStyle,
    label: { ...small, fontWeight: "500" } satisfies TextStyle,
    card: { ...panel, overflow: "hidden" } satisfies ViewStyle,
    map: { ...panel, padding: compact ? space[3] : space[4], gap: space[2] } satisfies ViewStyle,
    rows: perKey<RowLayout, readonly [ViewStyle, ViewStyle]>(ROW_LAYOUTS, (layout) => [
      layouts[layout],
      { ...layouts[layout], ...border },
    ]),
    rowSelected: { backgroundColor: c.surface2, borderRadius: 8 } satisfies ViewStyle,
    pressed: { opacity: 0.8 } satisfies ViewStyle,
    disabled: { opacity: 0.5 } satisfies ViewStyle,
    input,
    inputMultiline: { ...input, minHeight: 96, paddingTop: space[2] } satisfies TextStyle,
    buttons: perKey(VARIANTS, (variant) => ({
      container: { ...button, ...buttonFill(c, variant) } satisfies ViewStyle,
      text: { color: buttonText(c, variant), fontSize: 14 } satisfies TextStyle,
      icon: buttonText(c, variant),
    })),
    badge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: space[1.5],
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: "transparent",
      borderRadius: 9999,
      paddingHorizontal: space[2],
      paddingVertical: 2,
    } satisfies ViewStyle,
    badgeText: perKey(
      TONES,
      (tone) => ({ fontSize: 12, color: toneColor(c, tone) }) satisfies TextStyle,
    ),
    dot: perKey(
      TONES,
      (tone) =>
        ({
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: tone === "neutral" ? "transparent" : toneColor(c, tone),
          borderWidth: tone === "neutral" ? 1.5 : 0,
          borderColor: c.foregroundMuted,
        }) satisfies ViewStyle,
    ),
    notice: perKey(
      TONES,
      (tone) =>
        ({
          ...panel,
          ...(tone === "neutral"
            ? {}
            : { borderLeftWidth: 3, borderLeftColor: toneColor(c, tone) }),
          padding: compact ? space[3] : space[4],
          gap: space[2],
        }) satisfies ViewStyle,
    ),
    chip,
    chipSelected: {
      ...chip,
      borderColor: c.accent,
      backgroundColor: c.surface2,
    } satisfies ViewStyle,
    chipText: { ...text, fontSize: 13 } satisfies TextStyle,
    tab,
    tabSelected: { ...tab, backgroundColor: c.surface2 } satisfies ViewStyle,
    tabText: { fontSize: 14, color: c.foregroundMuted } satisfies TextStyle,
    tabTextSelected: { fontSize: 14, color: c.foreground } satisfies TextStyle,
    tabCount: { fontSize: 12, color: c.statusWarning } satisfies TextStyle,
    inlineActions: (compact
      ? { gap: space[2] }
      : {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: space[2],
        }) satisfies ViewStyle,
    nextAction: (compact
      ? { gap: space[3] }
      : { flexDirection: "row", alignItems: "center", gap: space[4] }) satisfies ViewStyle,
    nextActionCopy: (compact ? { gap: space[1] } : { flex: 1, minWidth: 0 }) satisfies ViewStyle,
    actions: (compact
      ? { flexDirection: "column-reverse", gap: space[2] }
      : { flexDirection: "row", justifyContent: "flex-end", gap: space[2] }) satisfies ViewStyle,
    header: {
      paddingHorizontal: gutter,
      paddingTop: compact ? space[3] : space[4],
      paddingBottom: space[3],
      gap: space[3],
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    } satisfies ViewStyle,
    content: { padding: gutter, gap: space[4], paddingBottom: space[8] } satisfies ViewStyle,
    pickerContent: {
      padding: gutter,
      gap: space[4],
      maxWidth: 720,
      width: "100%",
      alignSelf: "center",
    } satisfies ViewStyle,
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    } satisfies ViewStyle,
    avatarText: { ...small, color: c.foreground, fontWeight: "500" } satisfies TextStyle,
    mapNode: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      padding: space[3],
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      backgroundColor: c.surface0,
    } satisfies ViewStyle,
    mapIndent: Array.from(
      { length: MAP_INDENT_LEVELS },
      (_, depth): ViewStyle => ({
        flexDirection: "row",
        alignItems: "stretch",
        marginLeft: depth * (compact ? space[4] : space[6]),
      }),
    ),
    connector: {
      width: space[4],
      height: 28,
      marginRight: space[2],
      borderLeftWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border,
      borderBottomLeftRadius: 6,
    } satisfies ViewStyle,
    stepperValue: { ...text, minWidth: 24, textAlign: "center" } satisfies TextStyle,
    trackColor: { true: c.accent, false: c.surface2 },
  };
}

export type TeamsStyles = ReturnType<typeof buildStyles>;

const StylesContext = createContext<TeamsStyles | null>(null);

export function StylesProvider({
  theme,
  compact,
  children,
}: {
  theme: PluginTheme;
  compact: boolean;
  children: ReactNode;
}) {
  const styles = useMemo(() => buildStyles(theme, compact), [theme, compact]);
  return <StylesContext.Provider value={styles}>{children}</StylesContext.Provider>;
}

export function useStyles(): TeamsStyles {
  const styles = useContext(StylesContext);
  if (!styles) throw new Error("Lyre Teams styles are unavailable outside its surface");
  return styles;
}

/**
 * The pressable is the whole control. `onPress` receives `action`, so one stable handler can
 * serve several buttons in a component.
 */
export function Button({
  label,
  onPress,
  action = "",
  variant = "secondary",
  disabled = false,
  busy = false,
  busyLabel,
  icon,
  hint,
  a11yLabel,
  style,
}: {
  label: string;
  onPress(action: string): void;
  action?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  icon?: string;
  hint?: string;
  /** Spoken name when the visible label is a symbol or absent. */
  a11yLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const inactive = disabled || busy;
  const look = s.buttons[variant];
  const shown = busy && busyLabel !== undefined ? busyLabel : label;
  const spoken = busy && busyLabel ? busyLabel : (a11yLabel ?? label);
  const state = useMemo(() => ({ disabled: inactive, busy }), [inactive, busy]);
  const press = useCallback(() => onPress(action), [onPress, action]);
  const pressStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      look.container,
      inactive ? s.disabled : null,
      pressed && !inactive ? s.pressed : null,
      style,
    ],
    [look.container, inactive, s.disabled, s.pressed, style],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      accessibilityState={state}
      disabled={inactive}
      onPress={press}
      style={pressStyle}
    >
      {icon ? <Icon name={icon} size={16} color={look.icon} /> : null}
      {shown ? <Text style={look.text}>{shown}</Text> : null}
    </Pressable>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const s = useStyles();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={s.dot[tone]}
    />
  );
}

/** Status pill: tone colors the text and dot; the label always names the state. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const s = useStyles();
  return (
    <View style={s.badge}>
      <Dot tone={tone} />
      <Text style={s.badgeText[tone]}>{label}</Text>
    </View>
  );
}

export function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string;
  children: ReactNode;
}) {
  const s = useStyles();
  return (
    <View style={L.stack2}>
      <View style={L.between}>
        <Text accessibilityRole="header" style={s.label}>
          {title}
        </Text>
        {trailing ? <Text style={s.small}>{trailing}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.card}>{children}</View>;
}

export function Row({
  first = false,
  layout = "center",
  children,
}: {
  first?: boolean;
  layout?: RowLayout;
  children: ReactNode;
}) {
  const s = useStyles();
  return <View style={s.rows[layout][first ? 0 : 1]}>{children}</View>;
}

/** A whole-row pressable that drills in or performs one action. */
export function PressRow({
  first = false,
  label,
  hint,
  onPress,
  value = "",
  selected,
  children,
}: {
  first?: boolean;
  label: string;
  hint?: string;
  onPress(value: string): void;
  value?: string;
  selected?: boolean;
  children: ReactNode;
}) {
  const s = useStyles();
  const base = s.rows.center[first ? 0 : 1];
  const state = useMemo(() => (selected === undefined ? undefined : { selected }), [selected]);
  const press = useCallback(() => onPress(value), [onPress, value]);
  const pressStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      base,
      selected ? s.rowSelected : null,
      pressed ? s.pressed : null,
    ],
    [base, selected, s.rowSelected, s.pressed],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={state}
      onPress={press}
      style={pressStyle}
    >
      {children}
    </Pressable>
  );
}

export function Chevron() {
  const s = useStyles();
  return <Icon name="ChevronRight" size={14} color={s.colors.foregroundMuted} />;
}

/** Quiet alert: a tinted leading rule, the title, then muted description and actions. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
}) {
  const s = useStyles();
  return (
    <View style={s.notice[tone]}>
      <Text accessibilityRole="header" style={s.textMedium}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  const s = useStyles();
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.smallDanger}>
      {children}
    </Text>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const s = useStyles();
  let note: ReactNode = null;
  if (error) note = <ErrorLine>{error}</ErrorLine>;
  else if (hint) note = <Text style={s.small}>{hint}</Text>;
  return (
    <View style={L.stack15}>
      <Text style={s.textMedium}>{label}</Text>
      {children}
      {note}
    </View>
  );
}

export function Input({
  label,
  multiline = false,
  ...props
}: Omit<TextInputProps, "accessibilityLabel" | "style"> & { label: string }) {
  const s = useStyles();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={s.colors.foregroundMuted}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      {...props}
      style={multiline ? s.inputMultiline : s.input}
    />
  );
}

export interface ChoiceOption<Value extends string> {
  value: Value;
  label: string;
  hint?: string;
}

/** Single or multiple choice rendered as wrapping chips with radio/checkbox semantics. */
export function Choices<Value extends string>({
  label,
  options,
  selected,
  onToggle,
  multiple = false,
  disabled = false,
}: {
  label: string;
  options: readonly ChoiceOption<Value>[];
  selected: readonly Value[];
  onToggle(value: Value): void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      accessibilityRole={multiple ? undefined : "radiogroup"}
      accessibilityLabel={label}
      style={L.wrap}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          option={option}
          checked={selected.includes(option.value)}
          multiple={multiple}
          disabled={disabled}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

function Chip<Value extends string>({
  option,
  checked,
  multiple,
  disabled,
  onToggle,
}: {
  option: ChoiceOption<Value>;
  checked: boolean;
  multiple: boolean;
  disabled: boolean;
  onToggle(value: Value): void;
}) {
  const s = useStyles();
  const state = useMemo(() => ({ checked, disabled }), [checked, disabled]);
  const press = useCallback(() => onToggle(option.value), [onToggle, option.value]);
  const pressStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      checked ? s.chipSelected : s.chip,
      disabled ? s.disabled : null,
      pressed && !disabled ? s.pressed : null,
    ],
    [checked, disabled, s.chip, s.chipSelected, s.disabled, s.pressed],
  );
  let mark = "";
  if (checked) mark = multiple ? "✓ " : "● ";
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
      accessibilityState={state}
      disabled={disabled}
      onPress={press}
      style={pressStyle}
    >
      <Text style={s.chipText}>
        {mark}
        {option.label}
      </Text>
    </Pressable>
  );
}

export interface TabOption<Value extends string> {
  value: Value;
  label: string;
  count?: number;
}

export function Tabs<Value extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly TabOption<Value>[];
  value: Value;
  onChange(value: Value): void;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={L.wrap}>
      {tabs.map((tab) => (
        <Tab key={tab.value} tab={tab} selected={tab.value === value} onChange={onChange} />
      ))}
    </View>
  );
}

function Tab<Value extends string>({
  tab,
  selected,
  onChange,
}: {
  tab: TabOption<Value>;
  selected: boolean;
  onChange(value: Value): void;
}) {
  const s = useStyles();
  const state = useMemo(() => ({ selected }), [selected]);
  const press = useCallback(() => onChange(tab.value), [onChange, tab.value]);
  const pressStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      selected ? s.tabSelected : s.tab,
      pressed ? s.pressed : null,
    ],
    [selected, s.tab, s.tabSelected, s.pressed],
  );
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.count ? `${tab.label}, ${tab.count} need you` : tab.label}
      accessibilityState={state}
      onPress={press}
      style={pressStyle}
    >
      <Text style={selected ? s.tabTextSelected : s.tabText}>{tab.label}</Text>
      {tab.count ? <Text style={s.tabCount}>{tab.count}</Text> : null}
    </Pressable>
  );
}

/** Host modal: a bottom sheet on compact layouts and a centered dialog otherwise. */
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const change = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose],
  );
  return (
    <Modal title={title} open={open} onOpenChange={change}>
      <Modal.Content>{children}</Modal.Content>
    </Modal>
  );
}

/** Confirmation for actions that change recorded work. Red appears only inside it. */
export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  const s = useStyles();
  return (
    <Sheet title={title} open={open} onClose={onClose}>
      <View style={L.stack3}>{children}</View>
      <View style={s.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button
          label={confirmLabel}
          variant={destructive ? "danger" : "primary"}
          busy={busy}
          busyLabel="Saving..."
          onPress={onConfirm}
        />
      </View>
    </Sheet>
  );
}
