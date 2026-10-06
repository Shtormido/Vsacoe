import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F4F8',
  card: '#FFFFFF',
  text: '#16161D',
  muted: '#6E6E80',
  border: '#E3E3EA',
  accent: '#5B5BD6',
  accentSoft: '#EBEBFC',
  success: '#2F9E6B',
  successSoft: '#E3F6EC',
  danger: '#D64545',
  warnSoft: '#FFF4DB',
  warnText: '#8A5A00',
};

const dark: typeof light = {
  bg: '#0F0F14',
  card: '#1B1B23',
  text: '#F1F1F5',
  muted: '#9A9AAE',
  border: '#2C2C38',
  accent: '#8B8BF2',
  accentSoft: '#26264A',
  success: '#4CC38A',
  successSoft: '#163527',
  danger: '#F07070',
  warnSoft: '#3A2F14',
  warnText: '#F2C76B',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
