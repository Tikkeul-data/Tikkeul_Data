import { Lock, Mail, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
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
// 가입 전 이메일 인증번호 상태. idle(미요청) -> sending -> sent(입력 대기) -> confirming -> verified.
type VerifyState = 'idle' | 'sending' | 'sent' | 'confirming' | 'verified';

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

  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);

  const passwordBytes = new TextEncoder().encode(password).length;
  const emailValid = email.trim().includes('@');
  const passwordValid = password.length >= PASSWORD_MIN && passwordBytes <= PASSWORD_MAX_BYTES;
  const confirmError = confirm.length > 0 && confirm !== password ? t('auth.passwordMismatch') : undefined;
  const canSubmit = emailValid && passwordValid && confirm === password && !submitting && verifyState === 'verified';

  const onEmailChange = (v: string) => {
    setEmail(v);
    setEmailCheck('idle'); // 이메일을 고치면 이전 확인 결과는 무효 - 다시 확인해야 한다
    // 이메일이 바뀌면 이전에 받은 인증번호·인증 완료는 더 이상 이 이메일 것이 아니다 - 처음부터 다시 받아야 한다.
    setVerifyState('idle');
    setChallenge('');
    setCode('');
    setVerifyToken('');
    setVerifyError(null);
  };

  // 입력을 멈추면 자동으로 중복 확인한다(버튼 없음). 타이핑 중 요청이 쌓이지 않도록 디바운스한다.
  useEffect(() => {
    if (!emailValid) return;
    const trimmed = email.trim();
    const timer = setTimeout(async () => {
      setEmailCheck('checking');
      try {
        const res = await authApi.checkEmail(trimmed);
        setEmailCheck(res.available ? 'available' : 'taken');
      } catch {
        setEmailCheck('error');
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, emailValid]);

  const onSendCode = async () => {
    if (!emailValid || emailCheck === 'taken' || verifyState === 'sending') return;
    setVerifyState('sending');
    setVerifyError(null);
    try {
      const res = await authApi.sendSignupCode(email.trim());
      setChallenge(res.challenge);
      setVerifyState('sent');
    } catch (e) {
      setVerifyError(authErrorMessage(e, t));
      setVerifyState('idle');
    }
  };

  const onConfirmCode = async () => {
    if (code.trim().length === 0 || verifyState === 'confirming') return;
    setVerifyState('confirming');
    setVerifyError(null);
    try {
      const res = await authApi.verifySignupCode(email.trim(), code.trim(), challenge);
      setVerifyToken(res.token);
      setVerifyState('verified');
    } catch (e) {
      setVerifyError(authErrorMessage(e, t));
      setVerifyState('sent');
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signup(email.trim(), password, verifyToken);
      if (redirect) router.replace(redirect as never);
      else router.back();
    } catch (e) {
      setError(authErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  const sendDisabled = !emailValid || emailCheck === 'taken' || verifyState === 'sending' || verifyState === 'verified';

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
          error={emailCheck === 'taken' ? t('auth.emailTaken') : emailCheck === 'error' ? t('auth.networkError') : undefined}
          trailing={
            verifyState === 'verified' ? (
              <Text style={styles.verifiedBadge}>{t('auth.verifyButtonVerified')}</Text>
            ) : verifyState === 'sending' ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <Pressable onPress={onSendCode} disabled={sendDisabled} hitSlop={8}>
                <Text style={[styles.verifyLink, sendDisabled && styles.verifyLinkDisabled]}>{t('auth.verifyButton')}</Text>
              </Pressable>
            )
          }
        />
        {verifyError && verifyState === 'idle' && <Text style={styles.verifyErrorText}>{verifyError}</Text>}

        {(verifyState === 'sent' || verifyState === 'confirming') && (
          <View style={styles.codeBlock}>
            <Text style={styles.codeSentHint}>{t('auth.codeSent')}</Text>
            <TextField
              label={t('auth.codeLabel')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder={t('auth.codePlaceholder')}
              returnKeyType="done"
              onSubmitEditing={onConfirmCode}
              error={verifyError ?? undefined}
              trailing={
                verifyState === 'confirming' ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : (
                  <Pressable onPress={onConfirmCode} disabled={code.trim().length === 0} hitSlop={8}>
                    <Text style={[styles.verifyLink, code.trim().length === 0 && styles.verifyLinkDisabled]}>
                      {t('auth.codeConfirmButton')}
                    </Text>
                  </Pressable>
                )
              }
            />
          </View>
        )}

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
  hint: { fontSize: 12, color: colors.muted, marginTop: -space.sm },
  verifyLink: { fontSize: 13, fontWeight: '800', color: colors.brand },
  verifyLinkDisabled: { color: colors.muted },
  verifiedBadge: { fontSize: 13, fontWeight: '800', color: colors.guide },
  verifyErrorText: { fontSize: 13, color: colors.dangerInk, fontWeight: '600', marginTop: -space.xs },
  codeBlock: { gap: space.xs },
  codeSentHint: { fontSize: 12, color: colors.muted },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: space.xs, paddingTop: space.sm },
  footerText: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '800', color: colors.brand },
});
