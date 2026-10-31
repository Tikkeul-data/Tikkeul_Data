// 대중교통·네비게이션 탭의 "목적지까지 몇 분" 카드에 쓰는 소요시간 조회. 경로 전체(좌표·안내문구)는 필요 없고 시간만 있으면 된다.
import { fetchRouteStyles, fetchTransitRoutes } from '../map/navigationApi';
import type { RoutePoint } from '../map/types';

export type DurationMode = 'driving' | 'transit';

/** 소요시간(분)을 구한다. 경로를 못 찾으면 null. */
export async function fetchDurationMinutes(origin: RoutePoint, destination: RoutePoint, mode: DurationMode): Promise<number | null> {
  if (mode === 'transit') {
    const result = await fetchTransitRoutes(origin, destination);
    if (!result || result.routes.length === 0) return null;
    return Math.min(...result.routes.map((r) => r.durationMin));
  }
  const styles = await fetchRouteStyles(origin, destination);
  if (!styles || styles.length === 0) return null;
  const recommended = styles.find((s) => s.style === 'recommended') ?? styles[0];
  return recommended.durationMin;
}
