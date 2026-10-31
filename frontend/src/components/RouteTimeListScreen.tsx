import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from './Screen';
import { Card } from './ui/Card';
import { useAuth } from '../lib/auth/AuthContext';
import { favoritesApi, type FavoritePlace } from '../lib/favorites/api';
import { getCurrentLocation } from '../lib/location/getCurrentLocation';
import { loadRecents, type RecentDestination } from '../lib/recents';
import { setPendingSearch } from '../lib/navigation/pendingSearch';
import { fetchDurationMinutes, type DurationMode } from '../lib/routeDuration';
import type { RoutePoint } from '../map/types';
import { colors, radius, shadow, space } from '../theme';

function formatDuration(minutes: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return t('map.minutes', { n: rounded });
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? t('map.hours', { n: hours }) : t('map.hoursMinutes', { h: hours, m: rest });
}

// 즐겨찾기·최근 목적지 한 줄: 도착지까지 걸리는 시간(대중교통 또는 네비게이션)만 보여준다.
function DestinationRow({
  label,
  point,
  origin,
  mode,
  onPress,
}: {
  label: string;
  point: RoutePoint;
  origin: RoutePoint | null;
  mode: DurationMode;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    setLoading(true);
    fetchDurationMinutes(origin, point, mode)
      .then((value) => {
        if (!cancelled) setMinutes(value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, point, mode]);

  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : minutes === null ? (
        <Text style={styles.rowTimeMuted}>—</Text>
      ) : (
        <Text style={styles.rowTime}>{formatDuration(minutes, t)}</Text>
      )}
    </Pressable>
  );
}

interface Props {
  mode: DurationMode;
  titleKey: string;
}

// 대중교통·네비게이션 탭의 공통 화면: 즐겨찾기 한 장소에 맞는 경로가 먼저 뜨고, 스크롤하면 최근 목적지가 이어진다.
export function RouteTimeListScreen({ mode, titleKey }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, token } = useAuth();
  const [favorites, setFavorites] = useState<FavoritePlace[] | null>(null);
  const [recents, setRecents] = useState<RecentDestination[]>([]);
  const [origin, setOrigin] = useState<RoutePoint | null>(null);

  useFocusEffect(
    useCallback(() => {
      setRecents(loadRecents());
      getCurrentLocation().then(setOrigin);
    }, []),
  );

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      setFavorites(null);
      return;
    }
    favoritesApi.list(token).then(setFavorites).catch(() => setFavorites(null));
  }, [status, token]);

  const goToRoute = (point: RoutePoint, label: string) => {
    setPendingSearch({ point, label, mode });
    router.push('/');
  };

  const hasFavorites = favorites && favorites.length > 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        {hasFavorites && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>{t('transitTab.favoriteRoutes')}</Text>
            {favorites!.map((f) => (
              <DestinationRow
                key={f.id}
                label={f.label}
                point={{ lat: f.lat, lng: f.lon }}
                origin={origin}
                mode={mode}
                onPress={() => goToRoute({ lat: f.lat, lng: f.lon }, f.label)}
              />
            ))}
          </Card>
        )}
        {recents.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>{t('transitTab.recentDestinations')}</Text>
            {recents.map((r) => (
              <DestinationRow
                key={r.label}
                label={r.label}
                point={r.point}
                origin={origin}
                mode={mode}
                onPress={() => goToRoute(r.point, r.label)}
              />
            ))}
          </Card>
        )}
        {!hasFavorites && recents.length === 0 && <Text style={styles.empty}>{t('transitTab.empty')}</Text>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  section: { padding: space.md, gap: space.xs, boxShadow: shadow.float, borderRadius: radius.lg },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, marginBottom: space.xs },
  row: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 16, color: colors.ink, marginRight: space.sm },
  rowTime: { fontSize: 15, fontWeight: '700', color: colors.brand },
  rowTimeMuted: { fontSize: 15, color: colors.muted },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: space.xl },
});
