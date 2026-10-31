import { Coffee, Fuel, Pill, Scissors, ShoppingBag, ShoppingCart, SquareParking, Utensils, type LucideIcon } from 'lucide-react-native';

import { API_BASE_URL } from '../config';
import type { RoutePoint } from '../../map/types';

export type PlaceCategory = 'restaurant' | 'cafe' | 'convenience' | 'hair' | 'gas' | 'parking' | 'pharmacy' | 'mart';

export interface NearbyCategoryDef {
  key: PlaceCategory;
  labelKey: string;
  icon: LucideIcon;
  /** 카테고리 버튼 아이콘·지도 마커에 같이 쓰는 색. 카테고리를 한눈에 구분하기 위함(지도 앱들의 흔한 배색을 따름) */
  color: string;
}

// 검색창 밑 가로 스크롤 카테고리 버튼. 순서가 화면에 보이는 순서다.
export const NEARBY_CATEGORIES: NearbyCategoryDef[] = [
  { key: 'restaurant', labelKey: 'places.restaurant', icon: Utensils, color: '#F97316' },
  { key: 'cafe', labelKey: 'places.cafe', icon: Coffee, color: '#92400E' },
  { key: 'convenience', labelKey: 'places.convenience', icon: ShoppingBag, color: '#2563EB' },
  { key: 'hair', labelKey: 'places.hair', icon: Scissors, color: '#DB2777' },
  { key: 'gas', labelKey: 'places.gas', icon: Fuel, color: '#059669' },
  { key: 'parking', labelKey: 'places.parking', icon: SquareParking, color: '#4338CA' },
  { key: 'pharmacy', labelKey: 'places.pharmacy', icon: Pill, color: '#DC2626' },
  { key: 'mart', labelKey: 'places.mart', icon: ShoppingCart, color: '#0891B2' },
];

export interface NearbyPlace {
  name: string;
  address: string;
  distanceM: number;
  point: RoutePoint;
}

export async function fetchNearbyPlaces(category: PlaceCategory, origin: RoutePoint, radiusM = 1000): Promise<NearbyPlace[]> {
  const url = `${API_BASE_URL}/places/nearby?category=${category}&lat=${origin.lat}&lng=${origin.lng}&radius_m=${radiusM}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`nearby places request failed: ${res.status}`);
  const data: { places: { name: string; address: string; distance_m: number; lat: number; lng: number }[] } = await res.json();
  return data.places.map((p) => ({ name: p.name, address: p.address, distanceM: p.distance_m, point: { lat: p.lat, lng: p.lng } }));
}
