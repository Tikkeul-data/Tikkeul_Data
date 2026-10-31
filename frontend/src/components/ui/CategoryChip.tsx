import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Icon } from './Icon';

interface Props {
  label: string;
  icon: LucideIcon;
  /** 카테고리 고유 색. 선택 여부와 관계없이 아이콘 배지에 항상 쓴다(카테고리를 색으로 구분하기 위함) */
  color: string;
  selected: boolean;
  onPress: () => void;
}

// Chip 과 비슷한 알약 버튼이지만, 아이콘이 선택 여부와 상관없이 카테고리 고유 색 배지로 보인다(음식점 버튼 밑에
// 음식점 장소를 찾을 때 카카오맵·네이버지도 아이콘처럼 카테고리별 색이 바로 구분되도록).
export function CategoryChip({ label, icon, color, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-pressed={selected}
      style={({ pressed }) => [styles.base, selected && styles.selected, pressed && styles.pressed]}
    >
      <Icon icon={icon} size={14} color={color} />
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.brand, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  text: { fontSize: 13, fontWeight: '600', color: colors.ink },
  textSelected: { fontWeight: '800' },
});
