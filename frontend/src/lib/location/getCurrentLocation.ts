import type { RoutePoint } from '../../map/types';
import { DEMO_ORIGIN } from '../../map/demoDestinations';

// shortcut: 출발지는 항상 브라우저 GPS(실패 시 서울시청)로 고정한다. 출발지 직접 텍스트 입력(geocoding)은 없음 —
// 대신 지도를 클릭해서 출발지로 지정할 수 있다. (app/index.tsx 의 경로 검색과 즐겨찾기 탭-길안내가 같이 쓴다.)
export function getCurrentLocation(): Promise<RoutePoint> {
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
