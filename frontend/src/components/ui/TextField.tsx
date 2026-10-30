import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, shadow, space } from '../../theme';
import { Icon } from './Icon';

interface Props
  extends Pick<
    TextInputProps,
    'value' | 'onChangeText' | 'onSubmitEditing' | 'placeholder' | 'returnKeyType' | 'autoFocus' | 'keyboardType' | 'autoCapitalize' | 'autoComplete'
  > {
  label: string;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  leadingIcon?: LucideIcon;
  /** 있으면 비밀번호 입력창이 된다(가림·보기 전환 버튼이 붙는다). */
  secure?: boolean;
  /** 있으면 테두리가 위험색이 되고 아래 이 문구가 뜬다. */
  error?: string;
  /** 입력칸 오른쪽 끝에 붙는 요소(예: 인증 버튼). secure 와는 같이 안 쓴다. */
  trailing?: ReactNode;
}

// 로그인/가입 폼의 입력 필드. SearchBar와 같은 모양 언어(뜬 듯한 그림자 알약 · 포커스 시 브랜드 테두리)를 쓴다.
export function TextField({ label, inputRef, leadingIcon, secure, error, trailing, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.bar, focused && styles.barFocused, error && styles.barError]}>
        {leadingIcon && <Icon icon={leadingIcon} size={20} color={colors.muted} />}
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          style={styles.input}
          secureTextEntry={secure && !reveal}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {secure && (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'hide password' : 'show password'}
            hitSlop={8}
          >
            <Icon icon={reveal ? EyeOff : Eye} size={20} color={colors.muted} />
          </Pressable>
        )}
        {trailing}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted },
  bar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    boxShadow: shadow.card,
  },
  barFocused: { borderColor: colors.brand },
  barError: { borderColor: colors.dangerStrong },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: 16,
    color: colors.ink,
    outlineWidth: 0,
  },
  error: { fontSize: 13, color: colors.dangerInk, fontWeight: '600' },
});
