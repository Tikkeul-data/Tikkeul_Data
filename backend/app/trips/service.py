from typing import List

from sqlmodel import Session, select

from app.trips.models import RecentDestination, Trip

CELL_PRECISION = 3  # 소수 3자리 ~= 100m 격자


def cell_of(lat: float, lon: float) -> str:
    return f"{round(lat, CELL_PRECISION)},{round(lon, CELL_PRECISION)}"


def recent_destinations(session: Session, user_id: int, limit: int) -> List[RecentDestination]:
    # started_at 만으로 정렬하면 벽시계 해상도 때문에 거의 동시에 들어온 두 Trip의 순서가 보장되지 않는다.
    # id 는 같은 SQLite 커넥션이 순서대로 매기는 값이라 안전한 2차 정렬 기준이 된다.
    trips = session.exec(
        select(Trip).where(Trip.user_id == user_id).order_by(Trip.started_at.desc(), Trip.id.desc())
    ).all()
    seen_cells = set()
    result: List[RecentDestination] = []
    for trip in trips:
        if trip.destination_cell in seen_cells:
            continue
        seen_cells.add(trip.destination_cell)
        result.append(
            RecentDestination(
                label=trip.destination_label,
                lat=trip.destination_lat,
                lon=trip.destination_lon,
                address_text=trip.destination_address_text,
                last_used_at=trip.started_at,
            )
        )
        if len(result) >= limit:
            break
    return result
