import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Header({
  title,
  subtitle,
  onPrev,
  onNext,
  onTitlePress,
}: {
  title: string;
  subtitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onTitlePress?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      {onPrev ? <IconButton label="‹" onPress={onPrev} /> : <View style={styles.iconBtn} />}
      <Pressable style={styles.headerCenter} onPress={onTitlePress} disabled={!onTitlePress}>
        <Text style={[styles.headerTitle, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: t.muted }]}>{subtitle}</Text> : null}
      </Pressable>
      {onNext ? <IconButton label="›" onPress={onNext} /> : <View style={styles.iconBtn} />}
    </View>
  );
}

function IconButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? t.accentSoft : 'transparent' }]}
    >
      <Text style={[styles.iconBtnText, { color: t.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const t = useTheme();
  const pct = total ? done / total : 0;
  return (
    <View style={styles.progressWrap}>
      <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct * 100}%`, backgroundColor: pct === 1 ? t.success : t.accent },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: t.muted }]}>
        {done}/{total}
      </Text>
    </View>
  );
}

export function TaskRow({
  title,
  done,
  onToggle,
  onLongPress,
  meta,
  right,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  meta?: string;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.check,
          { borderColor: done ? t.success : t.muted, backgroundColor: done ? t.success : 'transparent' },
        ]}
      >
        {done ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[
            styles.rowTitle,
            { color: done ? t.muted : t.text, textDecorationLine: done ? 'line-through' : 'none' },
          ]}
        >
          {title}
        </Text>
        {meta ? <Text style={[styles.rowMeta, { color: t.muted }]}>{meta}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      style={[styles.chip, { backgroundColor: active ? t.accent : t.accentSoft }]}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : t.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function AddInput({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const submit = () => {
    const title = text.trim();
    if (!title) return;
    onAdd(title);
    setText('');
  };
  return (
    <View style={[styles.addRow, { borderColor: t.border }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        style={[styles.addInput, { color: t.text }]}
      />
      <Pressable
        onPress={submit}
        style={[styles.addBtn, { backgroundColor: text.trim() ? t.accent : t.border }]}
      >
        <Text style={styles.addBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? 'transparent' : t.accentSoft;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? t.danger : t.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.empty, { color: t.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 30, lineHeight: 34, fontWeight: '500' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 13, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  chipText: { fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  addInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '600' },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  empty: { fontSize: 14, paddingVertical: 10, textAlign: 'center' },
});
