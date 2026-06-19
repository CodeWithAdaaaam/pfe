from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import Optional

from ..database import models
from ..core.dependencies import get_db, require_role
from ..core import security

router = APIRouter(prefix="/admin", tags=["admin"])


# --- SCHEMAS ---

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # STUDENT | TEACHER | ADMIN

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    ability_theta: Optional[float] = None
    role: Optional[str] = None


# --- STATS GLOBALES ---

@router.get("/stats")
def get_admin_stats(
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    total_students = db.query(models.User).filter(models.User.role == "STUDENT").count()
    total_teachers = db.query(models.User).filter(models.User.role == "TEACHER").count()
    total_lessons  = db.query(models.Lesson).count()
    total_attempts = db.query(models.Attempt).count()
    avg_theta = db.query(func.avg(models.User.ability_theta)).filter(
        models.User.role == "STUDENT"
    ).scalar() or 0.0

    popular_lessons = db.query(
        models.Lesson.title,
        func.count(models.Attempt.id).label("attempts")
    ).join(models.Question, models.Question.lesson_id == models.Lesson.id
    ).join(models.Attempt, models.Attempt.question_id == models.Question.id
    ).group_by(models.Lesson.id
    ).order_by(func.count(models.Attempt.id).desc()).limit(5).all()

    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_lessons": total_lessons,
        "total_attempts": total_attempts,
        "average_theta": round(float(avg_theta), 2),
        "popular_lessons": [{"title": l.title, "attempts": l.attempts} for l in popular_lessons],
    }


# --- LISTE TOUS LES UTILISATEURS ---

@router.get("/users")
def list_users(
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    result = []
    for u in users:
        total   = db.query(models.Attempt).filter(models.Attempt.user_id == u.id).count()
        correct = db.query(models.Attempt).filter(
            models.Attempt.user_id == u.id, models.Attempt.is_correct == True
        ).count()
        result.append({
            "id": str(u.id),
            "name": u.full_name,
            "email": u.email,
            "role": u.role,
            "theta": round(u.ability_theta, 2),
            "progress_percent": max(0, min(100, int(((u.ability_theta + 3) / 6) * 100))),
            "total_attempts": total,
            "success_rate": round(correct / total * 100, 1) if total > 0 else 0,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })
    return result


# --- DETAIL UN UTILISATEUR ---

@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    total   = db.query(models.Attempt).filter(models.Attempt.user_id == user.id).count()
    correct = db.query(models.Attempt).filter(
        models.Attempt.user_id == user.id, models.Attempt.is_correct == True
    ).count()

    attempts = db.query(models.Attempt).filter(
        models.Attempt.user_id == user.id
    ).order_by(models.Attempt.timestamp.desc()).limit(50).all()

    attempts_detail = []
    for a in attempts:
        question = db.query(models.Question).filter(models.Question.id == a.question_id).first()
        lesson   = db.query(models.Lesson).filter(models.Lesson.id == question.lesson_id).first() if question else None
        attempts_detail.append({
            "id": str(a.id),
            "question_text": question.text[:100] if question else "—",
            "lesson_title": lesson.title if lesson else "—",
            "is_correct": a.is_correct,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        })

    return {
        "id": str(user.id),
        "name": user.full_name,
        "email": user.email,
        "role": user.role,
        "theta": round(user.ability_theta, 2),
        "progress_percent": max(0, min(100, int(((user.ability_theta + 3) / 6) * 100))),
        "total_attempts": total,
        "success_rate": round(correct / total * 100, 1) if total > 0 else 0,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "attempts": attempts_detail,
    }


# --- CRÉER UN UTILISATEUR (STUDENT ou TEACHER) ---

@router.post("/users")
def create_user(
    data: UserCreate,
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    if data.role not in ("STUDENT", "TEACHER", "ADMIN"):
        raise HTTPException(status_code=400, detail="Rôle invalide. Valeurs : STUDENT, TEACHER, ADMIN")
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    user = models.User(
        email=data.email,
        hashed_password=security.hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": str(user.id), "name": user.full_name, "email": user.email, "role": user.role}


# --- MODIFIER UN UTILISATEUR ---

@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    data: UserUpdate,
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if data.email is not None and data.email != user.email:
        if db.query(models.User).filter(models.User.email == data.email).first():
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
        user.email = data.email

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.ability_theta is not None:
        user.ability_theta = data.ability_theta
    if data.role is not None:
        if data.role not in ("STUDENT", "TEACHER", "ADMIN"):
            raise HTTPException(status_code=400, detail="Rôle invalide.")
        user.role = data.role

    db.commit()
    db.refresh(user)
    return {"id": str(user.id), "name": user.full_name, "email": user.email, "role": user.role, "theta": round(user.ability_theta, 2)}


# --- SUPPRIMER UN UTILISATEUR ---

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous supprimer vous-même.")

    db.query(models.Attempt).filter(models.Attempt.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return {"status": "success", "message": f"Utilisateur {user.full_name} supprimé."}


# --- LISTE DES COURS (lecture seule) ---

@router.get("/lessons")
def list_lessons(
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    lessons = db.query(models.Lesson).all()
    result = []
    for l in lessons:
        attempts = db.query(models.Attempt).join(
            models.Question, models.Question.id == models.Attempt.question_id
        ).filter(models.Question.lesson_id == l.id).count()
        result.append({
            "id": str(l.id),
            "title": l.title,
            "difficulty_level": l.difficulty_level,
            "total_attempts": attempts,
        })
    return result


# --- SUPPRIMER UN COURS ---

@router.delete("/lessons/{lesson_id}")
def delete_lesson(
    lesson_id: str,
    current_user: models.User = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db)
):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon non trouvée")

    questions = db.query(models.Question).filter(models.Question.lesson_id == lesson_id).all()
    for q in questions:
        db.query(models.Attempt).filter(models.Attempt.question_id == q.id).delete()
    db.query(models.Question).filter(models.Question.lesson_id == lesson_id).delete()
    db.query(models.LessonChunk).filter(models.LessonChunk.lesson_id == lesson_id).delete()
    db.delete(lesson)
    db.commit()
    return {"status": "success", "message": "Cours supprimé."}