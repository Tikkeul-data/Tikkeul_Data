// 최근 검색한 목적지·경로. 홈 화면과 대중교통·네비게이션 탭이 같이 쓴다.
// shortcut: 브라우저 localStorage에만 저장(기기 로컬, 이 브라우저 안에서만 보임). 계정 동기화 없음.
import type { RoutePoint } from '../map/types';
import type { TravelMode } from '../map/navigationApi';

export interface RecentDestination {
  label: string;
  point: RoutePoint;
}

const RECENTS_KEY = 'tikkeul:recentDestinations';
const MAX_RECENTS = 8;

export function loadRecents(): RecentDestination[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecent(entry: RecentDestination): RecentDestination[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const next = [entry, ...loadRecents().filter((r) => r.label !== entry.label)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export interface RecentRoute {
  originLabel: string;
  destinationLabel: string;
  destinationPoint: RoutePoint;
  mode: TravelMode;
}

const RECENT_ROUTES_KEY = 'tikkeul:recentRoutes';
const MAX_RECENT_ROUTES = 5;

export function loadRecentRoutes(): RecentRoute[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentRoute(entry: RecentRoute): RecentRoute[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const isSame = (r: RecentRoute) => r.destinationLabel === entry.destinationLabel && r.mode === entry.mode;
    const next = [entry, ...loadRecentRoutes().filter((r) => !isSame(r))].slice(0, MAX_RECENT_ROUTES);
    localStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
