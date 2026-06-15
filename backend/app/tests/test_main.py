import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.main import app
from app.database.models import Base
from app.core.dependencies import get_db

import os

DATABASE_URL = "postgresql://postgres.ebdstkoucralzcksdhoe:tyyarazwina@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

engine = create_engine(DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
client = TestClient(app)

# ─── AUTH ────────────────────────────────────────────────────────
def test_signup():
    res = client.post("/auth/signup", json={"email": "test@supmti.ma", "password": "secret123", "full_name": "Test"})
    assert res.status_code == 200

def test_signup_duplicate():
    client.post("/auth/signup", json={"email": "dup@test.ma", "password": "123456", "full_name": "Dup"})
    res = client.post("/auth/signup", json={"email": "dup@test.ma", "password": "123456", "full_name": "Dup"})
    assert res.status_code == 400

def test_login_success():
    client.post("/auth/signup", json={"email": "adam@test.ma", "password": "pass123", "full_name": "Adam"})
    res = client.post("/auth/login", json={"email": "adam@test.ma", "password": "pass123"})
    assert res.status_code == 200
    assert "access_token" in res.json()

def test_login_wrong_password():
    client.post("/auth/signup", json={"email": "adam2@test.ma", "password": "pass123", "full_name": "Adam"})
    res = client.post("/auth/login", json={"email": "adam2@test.ma", "password": "mauvais"})
    assert res.status_code == 401

# ─── HELPER ──────────────────────────────────────────────────────
def get_token(email="user@test.ma", password="pass123", name="User"):
    client.post("/auth/signup", json={"email": email, "password": password, "full_name": name})
    res = client.post("/auth/login", json={"email": email, "password": password})
    return res.json()["access_token"]

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# ─── ROUTES PROTÉGÉES ────────────────────────────────────────────
def test_lessons_requires_auth():
    res = client.get("/lessons")
    assert res.status_code == 401  # FastAPI retourne 401 sans token (pas 403)

def test_lessons_with_auth():
    token = get_token()
    res = client.get("/lessons", headers=auth_headers(token))
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_stats_with_auth():
    token = get_token("stats@test.ma")
    res = client.get("/stats", headers=auth_headers(token))
    assert res.status_code == 200
    assert "theta" in res.json()

def test_teacher_stats_blocked_for_student():
    token = get_token("student@test.ma")
    res = client.get("/teacher/stats", headers=auth_headers(token))
    assert res.status_code == 403

def test_lesson_not_found():
    import uuid
    token = get_token("notfound@test.ma")
    fake_id = str(uuid.uuid4())
    res = client.get(f"/lessons/{fake_id}", headers=auth_headers(token))
    assert res.status_code == 404

# ─── IRT ─────────────────────────────────────────────────────────
def test_irt_theta_increases_on_correct():
    from app.services.quiz_service import update_student_theta
    assert update_student_theta(0.0, 0.0, True) > 0.0

def test_irt_theta_decreases_on_wrong():
    from app.services.quiz_service import update_student_theta
    assert update_student_theta(0.0, 0.0, False) < 0.0

def test_irt_select_closest_question():
    from app.services.quiz_service import select_next_question
    from unittest.mock import MagicMock
    q1, q2, q3 = MagicMock(), MagicMock(), MagicMock()
    q1.difficulty_b, q2.difficulty_b, q3.difficulty_b = -1.0, 0.5, 2.0
    assert select_next_question([q1, q2, q3], 0.4) == q2