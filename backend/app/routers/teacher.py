from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from typing import Optional

from ..database import models
from ..core.dependencies import get_db, require_role

router = APIRouter(prefix="/teacher", tags=["teacher"])


@router.get("/stats")
def get_teacher_stats(
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    total_students = db.query(models.User).filter(models.User.role == "STUDENT").count()
    avg_theta = db.query(func.avg(models.User.ability_theta)).filter(models.User.role == "STUDENT").scalar() or 0
    popular_lessons = db.query(
        models.Lesson.title,
        func.count(models.Attempt.id).label("attempts")
    ).join(models.Question, models.Question.lesson_id == models.Lesson.id
    ).join(models.Attempt, models.Attempt.question_id == models.Question.id
    ).group_by(models.Lesson.id).order_by(func.count(models.Attempt.id).desc()).limit(5).all()

    return {
        "total_students": total_students,
        "average_theta": round(float(avg_theta), 2),
        "popular_lessons": [{"title": l.title, "attempts": l.attempts} for l in popular_lessons]
    }


@router.get("/students")
def get_students_list(
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    students = db.query(models.User).filter(models.User.role == "STUDENT").all()
    result = []
    for s in students:
        total = db.query(models.Attempt).filter(models.Attempt.user_id == s.id).count()
        correct = db.query(models.Attempt).filter(
            models.Attempt.user_id == s.id,
            models.Attempt.is_correct == True
        ).count()
        progress = max(0, min(100, int(((s.ability_theta + 3) / 6) * 100)))
        result.append({
            "id": str(s.id),
            "name": s.full_name,
            "email": s.email,
            "theta": round(s.ability_theta, 2),
            "progress_percent": progress,
            "total_attempts": total,
            "success_rate": round(correct / total * 100, 1) if total > 0 else 0,
        })
    return sorted(result, key=lambda x: x["theta"], reverse=True)


# --- CRUD ÉTUDIANT ---

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    ability_theta: Optional[float] = None


@router.get("/students/{student_id}")
def get_student_detail(
    student_id: str,
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    student = db.query(models.User).filter(
        models.User.id == student_id,
        models.User.role == "STUDENT"
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")

    total = db.query(models.Attempt).filter(models.Attempt.user_id == student.id).count()
    correct = db.query(models.Attempt).filter(
        models.Attempt.user_id == student.id,
        models.Attempt.is_correct == True
    ).count()
    progress = max(0, min(100, int(((student.ability_theta + 3) / 6) * 100)))

    attempts = db.query(models.Attempt).filter(
        models.Attempt.user_id == student.id
    ).order_by(models.Attempt.timestamp.desc()).limit(50).all()

    attempts_detail = []
    for a in attempts:
        question = db.query(models.Question).filter(models.Question.id == a.question_id).first()
        lesson = db.query(models.Lesson).filter(models.Lesson.id == question.lesson_id).first() if question else None
        attempts_detail.append({
            "id": str(a.id),
            "question_text": question.text[:100] if question else "—",
            "lesson_title": lesson.title if lesson else "—",
            "is_correct": a.is_correct,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        })

    return {
        "id": str(student.id),
        "name": student.full_name,
        "email": student.email,
        "theta": round(student.ability_theta, 2),
        "progress_percent": progress,
        "total_attempts": total,
        "success_rate": round(correct / total * 100, 1) if total > 0 else 0,
        "attempts": attempts_detail,
    }


@router.patch("/students/{student_id}")
def update_student(
    student_id: str,
    data: StudentUpdate,
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    student = db.query(models.User).filter(
        models.User.id == student_id,
        models.User.role == "STUDENT"
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")

    if data.email is not None and data.email != student.email:
        existing = db.query(models.User).filter(models.User.email == data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
        student.email = data.email

    if data.full_name is not None:
        student.full_name = data.full_name

    if data.ability_theta is not None:
        student.ability_theta = data.ability_theta

    db.commit()
    db.refresh(student)

    return {
        "id": str(student.id),
        "name": student.full_name,
        "email": student.email,
        "theta": round(student.ability_theta, 2),
    }


@router.delete("/students/{student_id}")
def delete_student(
    student_id: str,
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    student = db.query(models.User).filter(
        models.User.id == student_id,
        models.User.role == "STUDENT"
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")

    # Cascade : supprimer les tentatives liées
    db.query(models.Attempt).filter(models.Attempt.user_id == student.id).delete()
    db.delete(student)
    db.commit()

    return {"status": "success", "message": "Étudiant supprimé"}


@router.get("/heatmap")
def get_questions_heatmap(
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    questions = db.query(models.Question).all()
    result = []
    for q in questions:
        total = db.query(models.Attempt).filter(models.Attempt.question_id == q.id).count()
        wrong = db.query(models.Attempt).filter(
            models.Attempt.question_id == q.id,
            models.Attempt.is_correct == False
        ).count()
        if total == 0:
            continue
        # Récupérer le titre du cours associé
        lesson = db.query(models.Lesson).filter(models.Lesson.id == q.lesson_id).first()
        result.append({
            "question_id": str(q.id),
            "question_text": q.text[:80] + "..." if len(q.text) > 80 else q.text,
            "lesson_title": lesson.title if lesson else "—",
            "difficulty_b": q.difficulty_b,
            "total_attempts": total,
            "failure_rate": round(wrong / total * 100, 1),
        })
    return sorted(result, key=lambda x: x["failure_rate"], reverse=True)[:20]


@router.get("/recommendations")
def get_recommendations(
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    from sqlalchemy import case
    lessons = db.query(
        models.Lesson.id,
        models.Lesson.title,
        func.count(models.Attempt.id).label("total"),
        func.sum(case((models.Attempt.is_correct == False, 1), else_=0)).label("wrong")
    ).join(models.Question, models.Question.lesson_id == models.Lesson.id
    ).join(models.Attempt, models.Attempt.question_id == models.Question.id
    ).group_by(models.Lesson.id).all()

    result = []
    for l in lessons:
        total = l.total or 0
        wrong = l.wrong or 0
        if total == 0:
            continue
        failure_rate = round(wrong / total * 100, 1)
        result.append({
            "lesson_id": str(l.id),
            "lesson_title": l.title,
            "total_attempts": total,
            "failure_rate": failure_rate,
            "recommendation": (
                "🔴 Revoir en cours — taux d'échec très élevé" if failure_rate > 60 else
                "🟡 À surveiller — quelques difficultés détectées" if failure_rate > 35 else
                "🟢 Bonne maîtrise — continuer ainsi"
            )
        })
    return sorted(result, key=lambda x: x["failure_rate"], reverse=True)

@router.get("/progression")
def get_class_progression(
    current_user: models.User = Depends(require_role("TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    # Évolution du theta moyen par jour sur les 14 derniers jours
    since = datetime.utcnow() - timedelta(days=14)

    rows = db.query(
        cast(models.Attempt.timestamp, Date).label("day"),
        func.avg(models.User.ability_theta).label("avg_theta"),
        func.count(models.Attempt.id).label("attempts")
    ).join(models.User, models.User.id == models.Attempt.user_id
    ).filter(models.Attempt.timestamp >= since
    ).group_by(cast(models.Attempt.timestamp, Date)
    ).order_by(cast(models.Attempt.timestamp, Date)).all()

    return [
        {
            "date": str(row.day),
            "avg_theta": round(float(row.avg_theta), 2),
            "attempts": row.attempts,
            "progress_percent": max(0, min(100, int(((float(row.avg_theta) + 3) / 6) * 100)))
        }
        for row in rows
    ]