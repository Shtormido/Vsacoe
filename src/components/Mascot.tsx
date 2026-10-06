import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { getMascot, mascotPhrase, Mood, MOOD_BADGE } from '../mascot';
import { useStore } from '../store';
import { useTheme } from '../theme';

type Props = { mood: Mood; seed: string; vars?: Record<string, number> };

/** Маскот: говорит фразу по настроению, по нажатию подпрыгивает и говорит другую. */
export function Mascot({ mood, seed, vars }: Props) {
  const t = useTheme();
  const mascot = getMascot(useStore().state.settings);
  const [shift, setShift] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;

  const poke = () => {
    setShift((s) => s + 1);
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
  };

  const bg =
    mood === 'disappointed' || mood === 'late' ? t.warnSoft : mood === 'proud' ? t.successSoft : t.accentSoft;

  return (
    <Pressable onPress={poke} style={[styles.wrap, { backgroundColor: bg }]}>
      <Animated.View style={[styles.avatar, { backgroundColor: t.card, transform: [{ scale }] }]}>
        <Text style={styles.emoji}>{mascot.emoji}</Text>
        <View style={[styles.badge, { backgroundColor: t.card }]}>
          <Text style={styles.badgeText}>{MOOD_BADGE[mood]}</Text>
        </View>
      </Animated.View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: t.muted }]}>{mascot.name}</Text>
        <Text style={[styles.text, { color: t.text }]}>{mascotPhrase(mood, seed, shift, mascot.address, vars)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 14, marginBottom: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 40 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 15 },
  body: { flex: 1 },
  name: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  text: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
});
