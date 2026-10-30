import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, space } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

// 전체 너비 brand 색 버튼. 로그인·가입처럼 화면에서 가장 중요한 동작 하나에 쓴다.
export function PrimaryButton({ label, onPress, disabled, loading }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [styles.button, inactive && styles.disabled, pressed && !inactive && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: space.lg,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  label: { fontSize: 16, fontWeight: '800', color: colors.surface },
});
