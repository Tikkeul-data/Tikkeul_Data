// 대중교통·네비게이션 탭에서 고른 목적지를 홈 화면(지도)으로 넘기는 메모리 저장소.
// 홈 화면이 마운트될 때 한 번 읽어 바로 그 조건으로 경로를 검색한다. guidanceSession.ts 와 같은 패턴.
import type { RoutePoint } from '../../map/types';
import type { TravelMode } from '../../map/navigationApi';

export interface PendingSearch {
  point: RoutePoint;
  label: string;
  mode: TravelMode;
}

let current: PendingSearch | null = null;

export function setPendingSearch(request: PendingSearch): void {
  current = request;
}

export function getPendingSearch(): PendingSearch | null {
  return current;
}

export function clearPendingSearch(): void {
  current = null;
}
