import { Lock, Mail, X } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Logo } from '../src/components/Logo';
import { Screen } from '../src/components/Screen';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { RoundButton } from '../src/components/ui/RoundButton';
import { TextField } from '../src/components/ui/TextField';
import { authApi } from '../src/lib/auth/api';
import { authErrorMessage } from '../src/lib/auth/errorMessage';
import { useAuth } from '../src/lib/auth/AuthContext';
import { colors, space } from '../src/theme';

type EmailCheckState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const PASSWORD_MIN = 8;
// bcrypt 가 72바이트를 넘으면 조용히 잘라버린다 - 그보다 긴 비밀번호는 가입 단계에서 막는다(백엔드와 같은 기준).
const PASSWORD_MAX_BYTES = 72;

export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signup } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailCheck, setEmailCheck] = useState<EmailCheckState>('idle');
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);

  const passwordBytes = new TextEncoder().encode(password).length;
  const emailValid = email.trim().includes('@');
  const passwordValid = password.length >= PASSWORD_MIN && passwordBytes <= PASSWORD_MAX_BYTES;
  const confirmError = confirm.length > 0 && confirm !== password ? t('auth.passwordMismatch') : undefined;
  const canSubmit = emailValid && passwordValid && confirm === password && !submitting && emailCheck !== 'taken';

  const onEmailChange = (v: string) => {
    setEmail(v);
    setEmailCheck('idle'); // 이메일을 고치면 이전 확인 결과는 무효 - 다시 확인해야 한다
  };

  const onCheckEmail = async () => {
    if (!emailValid || emailCheck === 'checking') return;
    setEmailCheck('checking');
    try {
      const res = await authApi.checkEmail(email.trim());
      setEmailCheck(res.available ? 'available' : 'taken');
    } catch {
      setEmailCheck('error');
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signup(email.trim(), password);
      if (redirect) router.replace(redirect as never);
      else router.back();
    } catch (e) {
      setError(authErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton icon={X} label={t('common.close')} variant="soft" onPress={() => router.back()} />
      </View>

      <View style={styles.header}>
        <Logo />
        <Text style={styles.subtitle}>{t('auth.signupSubtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label={t('auth.email')}
          leadingIcon={Mail}
          value={email}
          onChangeText={onEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <View style={styles.checkRow}>
          <Pressable onPress={onCheckEmail} disabled={!emailValid || emailCheck === 'checking'} hitSlop={8}>
            <Text style={[styles.checkLink, (!emailValid || emailCheck === 'checking') && styles.checkLinkDisabled]}>
              {t('auth.checkEmail')}
            </Text>
          </Pressable>
          {emailCheck === 'checking' && <ActivityIndicator size="small" color={colors.muted} />}
          {emailCheck === 'available' && <Text style={styles.checkAvailable}>{t('auth.emailAvailable')}</Text>}
          {emailCheck === 'taken' && <Text style={styles.checkTaken}>{t('auth.emailTaken')}</Text>}
          {emailCheck === 'error' && <Text style={styles.checkTaken}>{t('auth.networkError')}</Text>}
        </View>
        <TextField
          label={t('auth.password')}
          leadingIcon={Lock}
          secure
          inputRef={passwordRef}
          value={password}
          onChangeText={setPassword}
          autoComplete="password-new"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <Text style={styles.hint}>{t('auth.passwordHint')}</Text>
        <TextField
          label={t('auth.passwordConfirm')}
          leadingIcon={Lock}
          secure
          inputRef={confirmRef}
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="password-new"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          error={confirmError ?? error ?? undefined}
        />
      </View>

      <PrimaryButton
        label={submitting ? t('auth.signingUp') : t('auth.signupButton')}
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.haveAccount')}</Text>
        <Text style={styles.link} onPress={() => router.replace(redirect ? { pathname: '/login', params: { redirect } } : '/login')}>
          {t('auth.goLogin')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  header: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  form: { gap: space.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.xs },
  checkLink: { fontSize: 13, fontWeight: '800', color: colors.brand },
  checkLinkDisabled: { color: colors.muted },
  checkAvailable: { fontSize: 13, fontWeight: '600', color: colors.guide },
  checkTaken: { fontSize: 13, fontWeight: '600', color: colors.dangerInk },
  hint: { fontSize: 12, color: colors.muted, marginTop: -space.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: space.xs, paddingTop: space.sm },
  footerText: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '800', color: colors.brand },
});
