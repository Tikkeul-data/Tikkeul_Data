import { Briefcase, Heart, House, MapPin, Trash2, X, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '../src/components/Screen';
import { Card } from '../src/components/ui/Card';
import { Chip } from '../src/components/ui/Chip';
import { Icon } from '../src/components/ui/Icon';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { RoundButton } from '../src/components/ui/RoundButton';
import { TextField } from '../src/components/ui/TextField';
import { ApiClientError } from '../src/lib/api/client';
import { useAuth } from '../src/lib/auth/AuthContext';
import { favoritesApi, type FavoriteKind, type FavoritePlace } from '../src/lib/favorites/api';
import { getCurrentLocation } from '../src/lib/location/getCurrentLocation';
import { setGuidanceRequest } from '../src/lib/navigation/guidanceSession';
import { colors, radius, shadow, space } from '../src/theme';

const KIND_ICON: Record<FavoriteKind, LucideIcon> = { home: House, work: Briefcase, custom: MapPin };
const KIND_ORDER: Record<FavoriteKind, number> = { home: 0, work: 1, custom: 2 };

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { status, token } = useAuth();

  const [items, setItems] = useState<FavoritePlace[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [startingId, setStartingId] = useState<number | null>(null);

  // 비로그인 상태로 들어오면(메뉴에서 직접 주소 입력 등) 로그인 화면으로 보내고, 성공하면 여기로 돌아온다.
  useEffect(() => {
    if (status === 'guest') router.replace({ pathname: '/login', params: { redirect: '/favorites' } });
  }, [status, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const list = await favoritesApi.list(token);
      setItems([...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id: number) => {
    if (!token) return;
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    try {
      await favoritesApi.remove(id, token);
    } catch {
      await load(); // 삭제 실패 - 지웠던 항목을 서버 상태로 되돌린다
    }
  };

  const onStart = async (item: FavoritePlace) => {
    setStartingId(item.id);
    try {
      const origin = await getCurrentLocation();
      setGuidanceRequest({
        origin,
        destination: { lat: item.lat, lng: item.lon },
        mode: 'driving',
        style: 'recommended',
        destinationLabel: item.label,
      });
      router.push('/navigation');
    } finally {
      setStartingId(null);
    }
  };

  if (status !== 'authenticated' || !token) return null; // guest 는 위 effect 가 로그인으로 보낸다

  return (
    <Screen>
      <View style={styles.topRow}>
        <Text style={styles.title}>{t('favorites.title')}</Text>
        <RoundButton
          icon={X}
          label={t('common.close')}
          variant="soft"
          onPress={() => router.replace((redirect as never) ?? '/')}
        />
      </View>

      {loadError && <Text style={styles.loadError}>{t('favorites.loadFailed')}</Text>}

      {items === null && !loadError ? (
        <ActivityIndicator color={colors.brand} style={styles.spinner} />
      ) : items && items.length === 0 ? (
        <View style={styles.empty}>
          <Icon icon={Heart} size={36} color={colors.line} />
          <Text style={styles.emptyTitle}>{t('favorites.empty')}</Text>
          <Text style={styles.emptyHint}>{t('favorites.emptyHint')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items?.map((item) => (
            <FavoriteRow key={item.id} item={item} loading={startingId === item.id} onPress={() => onStart(item)} onDelete={() => onDelete(item.id)} />
          ))}
        </View>
      )}

      <AddFavoriteCard token={token} existingKinds={new Set(items?.map((i) => i.kind))} onAdded={load} />
    </Screen>
  );
}

function FavoriteRow({ item, loading, onPress, onDelete }: { item: FavoritePlace; loading: boolean; onPress: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <Card style={styles.confirmCard}>
        <Text style={styles.confirmText}>{t('favorites.deleteConfirmTitle')}</Text>
        <View style={styles.confirmActions}>
          <Pressable onPress={() => setConfirming(false)} style={styles.confirmCancel}>
            <Text style={styles.confirmCancelText}>{t('common.close')}</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.confirmDelete}>
            <Text style={styles.confirmDeleteText}>{t('favorites.delete')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card onPress={onPress} accessibilityLabel={item.label} style={styles.row}>
      <View style={[styles.rowIcon, item.kind === 'custom' ? styles.rowIconCustom : styles.rowIconMain]}>
        <Icon icon={KIND_ICON[item.kind]} size={20} color={item.kind === 'custom' ? colors.brand : colors.surface} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {item.label}
        </Text>
        {!!item.address_text && (
          <Text style={styles.rowAddress} numberOfLines={1}>
            {item.address_text}
          </Text>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            setConfirming(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('favorites.delete')}
          hitSlop={8}
          style={styles.rowDelete}
        >
          <Icon icon={Trash2} size={18} color={colors.muted} />
        </Pressable>
      )}
    </Card>
  );
}

function AddFavoriteCard({ token, existingKinds, onAdded }: { token: string; existingKinds: Set<FavoriteKind> | undefined; onAdded: () => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FavoriteKind>('custom');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.addRow, pressed && styles.pressed]} accessibilityRole="button">
        <Icon icon={MapPin} size={18} color={colors.brand} />
        <Text style={styles.addRowText}>{t('favorites.add')}</Text>
      </Pressable>
    );
  }

  const onSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const point = await getCurrentLocation();
      await favoritesApi.create({ kind, label: label.trim(), lat: point.lat, lon: point.lng }, token);
      setLabel('');
      setKind('custom');
      setOpen(false);
      await onAdded();
    } catch (e) {
      setError(e instanceof ApiClientError && e.code === 'FAVORITE_KIND_TAKEN' ? t('favorites.kindTaken') : t('auth.genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.addCard}>
      <View style={styles.addHeader}>
        <Text style={styles.addTitle}>{t('favorites.addCustom')}</Text>
        <RoundButton icon={X} label={t('common.close')} variant="soft" size={44} onPress={() => setOpen(false)} />
      </View>
      <View accessibilityRole="radiogroup" style={styles.kindRow}>
        <Chip role="radio" label={t('favorites.home')} icon={House} selected={kind === 'home'} onPress={() => setKind('home')} />
        <Chip role="radio" label={t('favorites.work')} icon={Briefcase} selected={kind === 'work'} onPress={() => setKind('work')} />
        <Chip role="radio" label={t('favorites.title')} icon={MapPin} selected={kind === 'custom'} onPress={() => setKind('custom')} />
      </View>
      {(kind === 'home' ? existingKinds?.has('home') : kind === 'work' ? existingKinds?.has('work') : false) && (
        <Text style={styles.kindTakenNotice}>{t('favorites.kindTaken')}</Text>
      )}
      <TextField label={t('favorites.label')} placeholder={t('favorites.labelPlaceholder')} value={label} onChangeText={setLabel} error={error ?? undefined} />
      <Text style={styles.currentLocationHint}>📍 {t('map.myLocation')}</Text>
      <PrimaryButton label={t('favorites.save')} onPress={onSave} disabled={!label.trim() || saving} loading={saving} />
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  loadError: { fontSize: 14, color: colors.dangerInk, textAlign: 'center' },
  spinner: { paddingVertical: space.xl },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyHint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowIconMain: { backgroundColor: colors.brand },
  rowIconCustom: { backgroundColor: colors.primarySoft },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowAddress: { fontSize: 13, color: colors.muted },
  rowDelete: { padding: space.xs },
  confirmCard: { gap: space.md },
  confirmText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  confirmActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  confirmCancel: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  confirmDelete: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  confirmDeleteText: { fontSize: 14, fontWeight: '800', color: colors.dangerInk },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand,
  },
  pressed: { opacity: 0.7 },
  addRowText: { fontSize: 15, fontWeight: '800', color: colors.brand },
  addCard: { gap: space.md, boxShadow: shadow.float },
  addHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kindTakenNotice: { fontSize: 13, color: colors.dangerInk, fontWeight: '600' },
  currentLocationHint: { fontSize: 13, color: colors.muted },
});
