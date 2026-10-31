from typing import List

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.trips.models import RecentDestination, Trip, TripCreate, TripCreated
from app.trips.service import cell_of, recent_destinations

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.post("", response_model=TripCreated, status_code=201)
def create_trip(body: TripCreate, request: Request, user: User = Depends(get_current_user)) -> TripCreated:
    with Session(request.app.state.db_engine) as session:
        trip = Trip(
            user_id=user.id,
            origin_lat=body.origin.lat,
            origin_lon=body.origin.lon,
            origin_cell=cell_of(body.origin.lat, body.origin.lon),
            destination_lat=body.destination.lat,
            destination_lon=body.destination.lon,
            destination_cell=cell_of(body.destination.lat, body.destination.lon),
            destination_label=body.destination.label,
            destination_address_text=body.destination.address_text,
        )
        session.add(trip)
        session.commit()
        session.refresh(trip)
        return TripCreated(id=trip.id)


@router.get("/recent", response_model=List[RecentDestination])
def get_recent(request: Request, limit: int = Query(default=10, ge=1, le=50), user: User = Depends(get_current_user)) -> List[RecentDestination]:
    with Session(request.app.state.db_engine) as session:
        return recent_destinations(session, user.id, limit)
