import { Platform } from 'react-native';
import * as Location from 'expo-location';

import type { RoutePoint } from '../../map/types';
import { DEMO_ORIGIN } from '../../map/demoDestinations';

// shortcut: 출발지는 항상 GPS(실패 시 서울시청)로 고정한다. 출발지 직접 텍스트 입력(geocoding)은 없음 —
// 대신 지도를 클릭해서 출발지로 지정할 수 있다. (app/index.tsx 의 경로 검색과 즐겨찾기 탭-길안내가 같이 쓴다.)
// 네이티브에는 브라우저 geolocation 이 없어서(그대로 두면 항상 서울시청이 된다) expo-location 으로 읽는다. 권한 거부·실패는 웹과 같이 서울시청으로 폴백한다.
async function getNativeLocation(): Promise<RoutePoint> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return DEMO_ORIGIN;
    const known = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
    const position =
      known ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]));
    return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : DEMO_ORIGIN;
  } catch {
    return DEMO_ORIGIN;
  }
}

export function getCurrentLocation(): Promise<RoutePoint> {
  if (Platform.OS !== 'web') return getNativeLocation();
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(DEMO_ORIGIN);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(DEMO_ORIGIN),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}
