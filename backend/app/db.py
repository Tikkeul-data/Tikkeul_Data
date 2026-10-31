from pathlib import Path

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app.config import Settings


def make_engine(settings: Settings):
    url = settings.database_url
    connect_args = {"check_same_thread": False}
    if ":memory:" in url:
        return create_engine(url, connect_args=connect_args, poolclass=StaticPool)
    path = Path(url.removeprefix("sqlite:///"))
    path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, connect_args=connect_args)


def create_db_and_tables(engine) -> None:
    SQLModel.metadata.create_all(engine)
