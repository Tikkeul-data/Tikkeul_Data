# 사고다발구역 경고 (Accident-Prone Zone Alert) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, following the `test-driven-development` and `verification-before-completion` skills. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드에 이미 있는 `CautionZone(kind='accident_prone')`(사고다발구역) 데이터를, 기존 보호구역 경고와 같은 경로-매칭 파이프라인에 태워 운전 중 단계별(500·300·100m) 거리 경고로 띄운다.

**Architecture:** 어린이보호구역 경고(`protectionZoneToAlert` → `matchHazardsToRoute` → `useHazardWarning`)와 같은 경로-매칭을 재사용하지만, 보호구역과 달리 `/api/traffic/caution-zones`는 `data_kind=realtime`(router 주석: "주의운전구간(고속도로) - 실시간")이라 `registryZoneInput()`(항상 `confirmed`+`fresh`로 고정)을 그대로 쓰지 않는다 — 대신 ITS 돌발정보처럼 조회 신선도(`meta.stale`/`fetched_at`)를 반영한 입력을 직접 만든다. 또한 `CautionZone`에는 `Incident.event_key`에 대응하는 안정 식별자가 없어(문구가 바뀌면 `id`가 바뀜), 작은 백엔드 변경(Task 1)으로 먼저 추가한다.

**Tech Stack:** Python/FastAPI(백엔드 1개 작업), TypeScript/React Native, `pytest`(백엔드), `node:test`+`tsc --noEmit`(프론트, `frontend/tests/*.test.mjs`).

**Spec:** 이 문서 자체(대화에서 도출된 요구사항, `picky-team-lead-park` 설계 리뷰 반영판 — 별도 스펙 문서 없음).

## Global Constraints

- 백엔드 변경은 `CautionZone.event_key` 추가 1건뿐이다 — 기존 필드·엔드포인트 응답 모양은 그대로(추가 필드는 기본값 있는 옵션 필드라 기존 소비자에 영향 없음).
- 변환 함수는 다른 모듈을 import하지 않는 순수 함수로 작성한다(기존 `convert.ts` 관례, 파일 최상단 주석 참고).
- "확인되지 않은 값은 추측하지 않는다" — `CautionPoint`에 방위각(headingDeg)이 없으므로 방향을 지어내지 않고 경로 매칭은 `omnidirectional: true`로 처리한다(보호구역과 같은 근거. 다만 아래처럼 신선도는 보호구역과 다르게 다룬다).
- **신선도 처리 결정**: `/api/traffic/caution-zones`는 실시간 데이터다(`backend/app/routers/traffic.py:73` 주석, `data_kind=realtime`). 위치 매칭(경로 위에 있는지)은 기하학적으로 확정되므로 `class: 'confirmed'`를 유지하지만, `freshness`는 `registryZoneInput()`처럼 하드코딩된 `'fresh'`를 쓰지 않고 ITS 돌발정보와 같은 `INCIDENT_STALE_MS`(10분) 기준으로 `meta.stale || 10분 경과`면 `'stale'`로 표시한다. probable 강등(경로 확정 자체를 의심)까지는 하지 않는다 — 위치 불확실성이 아니라 "데이터가 오래됐을 수 있다"는 사실만 알리면 충분하다고 판단.
- 사고 유발 가능성을 "사고 확정"으로 표현하지 않는다(팀 CLAUDE.md 보안 규칙) — 배지 문구는 "주의"(`caution`)로, `accident`(실제 사고)와 구분한다.
- i18n 3개 언어(ko/en/zh) 모두 키를 채운다. 번역 문구가 없는 실제 데이터는 원문(한국어)으로 대체하는 기존 규칙(`localizeAlert`)은 그대로 유지 — 이 알림엔 `translations`를 만들어 넣지 않는다.
- 색은 기존 `hazardTone`의 다른 유형과 명도·색상 모두 분명히 구분되어야 한다(공사의 호박색 계열과 붙지 않게).

## Review Focus

- `kind`가 `accident_prone`이 아닌 `CautionZone`(congestion/lane_blocked/tunnel_glare/work/rest_area/other)이 들어오면 `cautionZoneToAlert`가 `null`을 돌려줘야 한다.
- `includeIncidents: false`(자전거·대중교통 모드)일 때 사고다발구역도 조회·매칭하지 않아야 한다 — 보호구역만 쓰는 기존 정책과 어긋나면 안 된다.
- `/api/traffic/caution-zones` 조회가 실패하거나 오래된 캐시를 내려주면(`meta.stale`), `notice`가 `'failed'`로 올라가거나 해당 경고에 "오래된 정보" 표시가 붙어야 한다 — 실패·오래됨을 "방금 확인된 확정 위험"으로 보여주면 안전상 위험하다.
- `occrrncId`가 빈 문자열인 사고다발구역(`backend/tests/fixtures.py:33`, 메시지까지 해시에 넣는 digest가 id가 되는 경우)에서, 문구(`message`)만 바뀌었을 때 `event_key`는 그대로이고 `id`만 바뀌는지 — 안 그러면 같은 구역이 재탐색마다 새 위험으로 다시 경고된다(`Incident`가 이미 겪은 문제, `backend/app/adapters.py:114` 주석 참고).
- 타입 체크(`tsc --noEmit`)가 깨지지 않는지 — `AlertType`에 새 값을 추가하면 `Record<AlertType, ...>` 형태의 상수(`TYPE_POINTS`, `hazardTone`, `TYPE_ICON`, `BADGE_BY_TYPE`)를 전부 채워야 컴파일된다. `node:test`만으로는 이걸 못 잡는다.

---

### Task 1: 백엔드 — `CautionZone.event_key`(안정 식별자)

**Files:**
- Modify: `backend/app/models.py` — `CautionZone`에 `event_key` 필드 추가
- Modify: `backend/app/adapters.py:142-146` — `parse_caution_zones`에서 `event_key` 채우기
- Test: `backend/tests/test_adapters.py`

**Interfaces:**
- Produces: `CautionZone.event_key: str`(기본값 `""`) — Task 3에서 `cautionZoneToAlert`가 `RoadAlert.eventKey`로 옮긴다.

- [ ] **Step 1: Write the failing test** (`backend/tests/test_adapters.py`, `test_incident_event_key_is_stable_when_only_the_message_changes` 바로 아래에 추가)

```python
def test_caution_zone_event_key_is_stable_when_only_the_message_changes():
    original = parse_caution_zones([CAUTION_ITEMS[0]])[0]
    reworded = parse_caution_zones([{**CAUTION_ITEMS[0], "message": "사고잦은구간 추돌주의(갱신)"}])[0]
    assert reworded.id != original.id  # 기존 id 는 문구까지 해시한다(occrrncId 없을 때)
    assert reworded.event_key == original.event_key  # 같은 구역은 같은 키


def test_caution_zone_event_key_prefers_occrrncId():
    # occrrncId 가 있으면(CAUTION_ITEMS[1]) event_key 도 그 값을 그대로 쓴다
    zone = parse_caution_zones([CAUTION_ITEMS[1]])[0]
    assert zone.event_key == "20261028070000000001" == zone.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_adapters.py -k caution_zone_event_key -v`
Expected: FAIL — `CautionZone` has no attribute `event_key` (또는 `AttributeError`)

- [ ] **Step 3: Implement**

`backend/app/models.py`의 `CautionZone`에 필드 추가(Incident의 `event_key` 설명과 같은 근거):
```python
event_key: str = Field("", description="같은 구역을 가리키는 안정 키. message 가 바뀌어도 그대로다. id 와 달리 문구에 영향받지 않는다")
```

`backend/app/adapters.py` `parse_caution_zones`에서 `id=` 다음 줄에 추가(digest는 `message`를 빼고 동일 입력으로):
```python
event_key=_s(raw, "occrrncId") or _digest(outbrk, _s(raw, "startStdLinkId"), _s(raw, "revStdLinkId")),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_adapters.py -k caution_zone_event_key -v`
Expected: PASS

- [ ] **Step 5: Propose the commit (do NOT run it without user approval)**

```bash
git add backend/app/models.py backend/app/adapters.py backend/tests/test_adapters.py
git commit -m "feat(backend): CautionZone에 안정 식별자(event_key) 추가"
```

---

### Task 2: 변환 함수 + 표시 상수(색·아이콘·문구·우선순위 점수)

**Files:**
- Modify: `frontend/src/types/traffic.ts:80-89` — `CautionZone`에 `event_key: string` 추가
- Modify: `frontend/src/types/alert.ts` — `AlertType`에 `'accident_prone'` 추가
- Modify: `frontend/src/theme.ts:32-38` — `hazardTone`에 `accident_prone` 색 추가
- Modify: `frontend/src/components/alerts/AlertCard.tsx:18-23` — `TYPE_ICON`에 `accident_prone` 추가
- Modify: `frontend/src/lib/hazardPriority.ts:67` — `TYPE_POINTS`에 `accident_prone` 점수 추가
- Modify: `frontend/src/lib/api/convert.ts` — `cautionZoneToAlert`, `cautionZonesToAlerts` 추가, `BADGE_BY_TYPE`·`ORDER`에 `accident_prone` 추가
- Modify: `frontend/src/i18n/locales/ko.ts:149`(`alerts.type`), `:220-232`(`hazard.*`), `en.ts`, `zh.ts` 같은 자리 — 키 추가
- Test: `frontend/tests/convert.test.mjs`

**Interfaces:**
- Consumes: `CautionZone`(이제 `event_key` 포함), `RoadAlert`
- Produces: `cautionZoneToAlert(zone: CautionZone): RoadAlert | null`, `cautionZonesToAlerts(zones: CautionZone[]): RoadAlert[]` — Task 3이 그대로 가져다 쓴다. `RoadAlert.type`에 `'accident_prone'`이 유효해진다 — Task 3의 `prioritizeHazards`가 `TYPE_POINTS['accident_prone']`를 참조한다.

- [ ] **Step 1: Write the failing tests** (`frontend/tests/convert.test.mjs`에 추가, import 목록에 `cautionZoneToAlert`, `cautionZonesToAlerts` 추가)

```js
const caution = (over = {}) => ({
  id: 'cz1', kind: 'accident_prone', outbrk_type: '사고잦은구간', message: '사고 잦은 구간입니다',
  priority: 1, step_type: 'N', event_key: 'ek1',
  start: { location: { lat: 37.5, lon: 127.03 }, link_id: 'L1', route_no: '47', route_name: '47번국도', direction_text: '' },
  notice: null, ...over,
});

test('사고다발구역(accident_prone)만 알림으로 바꾸고, 다른 주의운전구간 유형은 뺀다', () => {
  assert.equal(cautionZoneToAlert(caution({ kind: 'congestion' })), null);
  const a = cautionZoneToAlert(caution());
  assert.equal(a.type, 'accident_prone');
  assert.equal(a.severity, 'caution');
  assert.equal(a.location, '47번국도');
  assert.equal(a.description, '사고 잦은 구간입니다');
  assert.equal(a.latitude, 37.5);
  assert.equal(a.longitude, 127.03);
  assert.equal(a.omnidirectional, true);
  assert.equal(a.eventKey, 'ek1');
  assert.ok(!('headingDeg' in a), '방향을 만들어 넣지 않는다');
});

test('사고다발구역: 도로명이 없으면 노선번호, 문구가 없으면 콘텐츠 유형을 쓴다. event_key 없으면 필드 자체를 안 만든다', () => {
  const a = cautionZoneToAlert(caution({ start: { ...caution().start, route_name: '' }, message: ' ', event_key: '' }));
  assert.equal(a.location, '47');
  assert.equal(a.description, '사고잦은구간');
  assert.ok(!('eventKey' in a));
});

test('사고다발구역은 방향 없이도(omnidirectional) 경로 위 위험으로 매칭된다', () => {
  const p = MOCK_ROUTE_A.points[1];
  const a = cautionZoneToAlert(caution({ start: { ...caution().start, location: { lat: p.latitude, lon: p.longitude } } }));
  const result = matchHazardsToRoute(MOCK_ROUTE_A, [a]);
  assert.equal(result.onRoute.length, 1);
});

test('cautionZonesToAlerts: accident_prone 외 유형은 걸러낸다', () => {
  const zones = [caution({ id: 'a1' }), caution({ id: 'a2', kind: 'work' })];
  assert.deepEqual(cautionZonesToAlerts(zones).map((a) => a.id), ['a1']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- tests/convert.test.mjs`
Expected: FAIL — `cautionZoneToAlert is not a function`

- [ ] **Step 3: Implement**

`frontend/src/types/traffic.ts`: `CautionZone`에 `event_key: string` 추가.

`frontend/src/types/alert.ts`: `AlertType`에 `'accident_prone'` 추가.

`frontend/src/theme.ts`: 기존 `construction`(#D97706/#B45309)과 분명히 구분되는 색으로 `hazardTone.accident_prone = { tint: '#FDF2F8', accent: '#BE185D', strong: '#9D174D' }`(로즈 계열 — 빨강·호박색·초록과 모두 구분).

`frontend/src/components/alerts/AlertCard.tsx`: `TYPE_ICON.accident_prone = TriangleAlert`(이미 import된 아이콘 재사용).

`frontend/src/lib/hazardPriority.ts`: `TYPE_POINTS.accident_prone = 18`(다른 값들과 같은 "설계상 임시 기준" — congestion(12)보다 높고 construction(20)보다 낮게, 등록된 위험지역이지만 실시간 사고는 아니라는 근거로 school_zone(25)보다도 낮게 잡는다).

`frontend/src/lib/api/convert.ts`:
```ts
export function cautionZoneToAlert(zone: CautionZone): RoadAlert | null {
  if (zone.kind !== 'accident_prone') return null;
  const alert: RoadAlert = {
    id: zone.id,
    type: 'accident_prone',
    severity: 'caution',
    location: zone.start.route_name.trim() || zone.start.route_no.trim(),
    description: zone.message.trim() || zone.outbrk_type.trim(),
    updatedAt: '',
    latitude: zone.start.location.lat,
    longitude: zone.start.location.lon,
    omnidirectional: true,
  };
  if (zone.event_key) alert.eventKey = zone.event_key;
  return alert;
}

export function cautionZonesToAlerts(zones: CautionZone[]): RoadAlert[] {
  return zones.map(cautionZoneToAlert).filter((a): a is RoadAlert => a !== null);
}
```
`BADGE_BY_TYPE`에 `accident_prone: 'caution'` 추가. `ORDER`에 `accident_prone: 4`(school_zone(3) 다음, 가장 낮은 우선순위) 추가.

`ko.ts`: `alerts.type`에 `accident_prone: '사고다발구역'` 추가. `hazard.message.accident_prone: '전방 {{distance}} 사고다발구역'`, `hazard.advance.accident_prone: '전방 {{distance}} 사고다발구역이 있어요. 서행하세요'` 추가. `en.ts`/`zh.ts`에도 같은 세 키를 각 언어로 추가.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- tests/convert.test.mjs`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 에러 없음(`AlertType`을 키로 쓰는 모든 `Record`에 `accident_prone`이 채워져 있어야 통과한다)

- [ ] **Step 6: Propose the commit (do NOT run it without user approval)**

```bash
git add frontend/src/types/traffic.ts frontend/src/types/alert.ts frontend/src/theme.ts frontend/src/components/alerts/AlertCard.tsx frontend/src/lib/hazardPriority.ts frontend/src/lib/api/convert.ts frontend/src/i18n/locales/ko.ts frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/tests/convert.test.mjs
git commit -m "feat(alerts): 사고다발구역(accident_prone) 알림 변환·표시·우선순위 추가"
```

---

### Task 3: 경로 위험 경고 파이프라인에 배선(신선도 반영)

**Files:**
- Modify: `frontend/src/lib/navigation/useRouteHazardWarning.ts`

**Interfaces:**
- Consumes: Task 2의 `cautionZonesToAlerts`; 기존 `trafficApi.cautionZones(bbox)`(변경 없음); 기존 `matchHazardsToRoute`, `remainingHazards`(변경 없음); `IncidentMatch`, `MatchClass`, `Freshness` 타입(`frontend/src/lib/routeHazards.ts`, 변경 없음)
- Produces: 없음(최종 소비 지점 — 반환값 시그니처는 바뀌지 않는다)

이 작업은 이미 테스트된 순수 함수들을 글루 코드로 연결하는 작업이라 새 단위 테스트는 추가하지 않는다(프로젝트에 훅 레벨 테스트가 없음). Step 2(전체 테스트)와 Step 3(타입체크)으로 회귀를 확인한다.

- [ ] **Step 1: Implement**

`useRouteHazardWarning.ts`에 보호구역 조회 섹션 바로 아래, ITS 돌발정보 조회 섹션 앞에 사고다발구역 조회를 추가한다. 기존 `incidents` 조회와 같은 `area`(bbox)를 재사용한다:

```ts
const cautionZones = useApi((signal) => trafficApi.cautionZones(area!.bbox, { signal }), {
  key: area ? `caution:${area.key}` : '',
  enabled: !!area,
  refreshMs: INCIDENT_REFRESH_MS,
  keepPrevious: true,
});
const cautionZoneResponse = cautionZones.state.status === 'success' ? cautionZones.state.data : null;
const cautionZoneAlerts = useMemo<RoadAlert[]>(() => {
  if (!includeIncidents || route?.source === 'mock') return [];
  return cautionZoneResponse ? cautionZonesToAlerts(cautionZoneResponse.items) : [];
}, [includeIncidents, route?.source, cautionZoneResponse]);
// ITS 돌발정보와 같은 기준(10분)으로 신선도를 본다 — registryZoneInput 처럼 무조건 'fresh'로 두지 않는다(Global Constraints 참고)
const cautionZonesStale = cautionZoneResponse
  ? cautionZoneResponse.meta.stale || Date.now() - Date.parse(cautionZoneResponse.meta.fetched_at) > INCIDENT_STALE_MS
  : false;
const cautionZoneOnRoute = useMemo(
  () => (hazardRoute ? matchHazardsToRoute(hazardRoute, cautionZoneAlerts).onRoute : []),
  [hazardRoute, cautionZoneAlerts],
);
const cautionZoneInputs = useMemo(
  () =>
    cautionZoneOnRoute.map(({ alert, offsetM }) => ({
      alert,
      match: {
        class: 'confirmed' as const,
        reason: 'zoneOnRoute' as const,
        distanceAlongRouteM: offsetM - progressBucket * 5,
        lateralM: null,
        directionBasis: 'both' as const,
        freshness: (cautionZonesStale ? 'stale' : 'fresh') as const,
      },
    })),
  [cautionZoneOnRoute, progressBucket, cautionZonesStale],
);
```

`zoneInputs` 계산(기존 보호구역 전용)에 `cautionZoneInputs`를 합친다:
```ts
const zoneInputs = useMemo(
  () => [...zoneOnRoute.map(({ alert, offsetM }) => registryZoneInput(alert, offsetM - progressBucket * 5)), ...cautionZoneInputs],
  [zoneOnRoute, cautionZoneInputs, progressBucket],
);
```

`useHazardWarning`에 넘기는 `hazards` 배열에 사고다발구역을 추가:
```ts
hazards: [...remainingHazards(zoneOnRoute, progressM), ...remainingHazards(cautionZoneOnRoute, progressM), ...incidentHazards],
```

`notice` 계산에 사고다발구역 조회 실패를 포함(기존 `incidentsFailed` 옆에):
```ts
const cautionZonesFailed = includeIncidents && isApiRoute && cautionZones.state.status === 'error';
// notice 의 incidentsFailed 를 (incidentsFailed || cautionZonesFailed) 로 바꾼다
```

import 목록에 `cautionZonesToAlerts`(`convert.ts`) 추가.

- [ ] **Step 2: Run full test suite to verify no regression**

Run: `cd frontend && npm test`
Expected: 기존 테스트 전부 PASS

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 에러 없음

- [ ] **Step 4: Manual smoke check**

Run: `cd frontend && npm run web` 후 개발용 가상 경로로 안내 화면에 들어가 콘솔 에러 없이 뜨는지 확인.

- [ ] **Step 5: Propose the commit (do NOT run it without user approval)**

```bash
git add frontend/src/lib/navigation/useRouteHazardWarning.ts
git commit -m "feat(navigation): 사고다발구역을 경로 위험 경고 파이프라인에 연결(신선도 반영)"
```
