import { useRef } from 'react';
import { Animated, Share, StyleSheet, Text, View } from 'react-native';
import { Mascot } from '../components/Mascot';
import { Button, Card, Header } from '../components/ui';
import { dateKey, formatDay, plural } from '../dates';
import { MASCOT_NAME } from '../mascot';
import { QUOTES, quoteOfDay } from '../quotes';
import { dayStats, useStore } from '../store';
import { useTheme } from '../theme';

type Props = { today: Date; openToday: () => void };

export function MotivationScreen({ today, openToday }: Props) {
  const t = useTheme();
  const { state, dispatch } = useStore();
  const opacity = useRef(new Animated.Value(1)).current;

  const key = dateKey(today);
  const index = state.motivation?.date === key ? state.motivation.index : quoteOfDay(today);
  const quote = QUOTES[index];
  const author = quote.author ?? `${MASCOT_NAME} 🦝`;
  const { done, total } = dayStats(state, key);
  const left = total - done;

  const refresh = () => {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * QUOTES.length);
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      dispatch({ type: 'setMotivation', date: key, index: next });
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  return (
    <View>
      <Header title="Мотивация" subtitle={`Фраза дня · ${formatDay(today)}`} />

      <Card style={{ ...styles.quoteCard, borderLeftColor: t.accent }}>
        <Animated.View style={{ opacity }}>
          <Text style={[styles.quote, { color: t.text }]}>{quote.text}</Text>
          <Text style={[styles.author, { color: t.muted }]}>— {author}</Text>
        </Animated.View>
      </Card>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label="🔄 Другая фраза" onPress={refresh} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="📤 Поделиться"
            kind="secondary"
            onPress={() => Share.share({ message: `«${quote.text}» — ${author}` })}
          />
        </View>
      </View>

      <Mascot mood="motivation" seed={key} />

      {left > 0 ? (
        <Card>
          <Text style={[styles.left, { color: t.text }]}>
            На сегодня осталось {left} {plural(left, ['задача', 'задачи', 'задач'])}. Мотивация без действия — просто
            красивые слова.
          </Text>
          <Button label="К делам →" onPress={openToday} />
        </Card>
      ) : null}

      <Text style={[styles.hint, { color: t.muted }]}>Каждый день здесь новая фраза.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  quoteCard: { paddingVertical: 28, paddingHorizontal: 22, borderLeftWidth: 6 },
  quote: { fontSize: 24, lineHeight: 33, fontWeight: '800' },
  author: { fontSize: 15, marginTop: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  left: { fontSize: 15, lineHeight: 21, marginBottom: 12 },
  hint: { fontSize: 13, textAlign: 'center' },
});
