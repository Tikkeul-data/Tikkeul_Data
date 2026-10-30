from typing import Optional

from sqlmodel import Field, Session, SQLModel, select

from app.db import create_db_and_tables, make_engine
from tests.conftest import make_settings


class _Thing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str


def test_memory_engine_keeps_data_across_separate_sessions():
    engine = make_engine(make_settings(database_url="sqlite:///:memory:"))
    SQLModel.metadata.create_all(engine, tables=[_Thing.__table__])
    with Session(engine) as s1:
        s1.add(_Thing(name="a"))
        s1.commit()
    with Session(engine) as s2:
        assert s2.exec(select(_Thing)).first().name == "a"


def test_file_engine_creates_missing_parent_directory(tmp_path):
    db_path = tmp_path / "nested" / "test.db"
    engine = make_engine(make_settings(database_url=f"sqlite:///{db_path}"))
    create_db_and_tables(engine)
    assert db_path.exists()
