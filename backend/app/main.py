from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from reportlab.pdfgen import canvas
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import io

from .database.session import SessionLocal, init_db
from .database import models
from .services import ai_service, quiz_service, chat_service
from .core import security
from .core.dependencies import get_db, get_current_user, require_role
from .routers import teacher
from .routers import admin
from typing import Optional


# --- APP ---
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="LearnAI API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","https://pfe-phi-two.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(teacher.router)
app.include_router(admin.router) 

# --- SCHÉMAS ---
class CourseRequest(BaseModel):
    topic: str
    level: str

class ChatRequest(BaseModel):
    lesson_id: str
    question: str
    session_id: str

class UserSignup(BaseModel):
    email: str
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class QuizSubmit(BaseModel):
    question_id: str
    answer: str
class OpenQuestionSubmit(BaseModel):
    question_id: str
    answer: str  # réponse ouverte de l'étudiant
 
class ChatRequestWithMode(BaseModel):
    lesson_id: str
    question: str
    session_id: str
    mode: str = "normal"
    pdf_base64: Optional[str] = None
    pdf_name: Optional[str] = None
class ReformulateRequest(BaseModel):
    lesson_id: str
# --- AUTH (public) ---

@app.post("/auth/signup")
def signup(user_data: UserSignup, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    db.add(models.User(
        email=user_data.email,
        hashed_password=security.hash_password(user_data.password),
        full_name=user_data.full_name,
        role="STUDENT"
    ))
    db.commit()
    return {"status": "success", "message": "Compte créé !"}

@app.post("/auth/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == credentials.email).first()
    if not user or not security.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    token = security.create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"name": user.full_name, "email": user.email, "role": user.role}
    }

# --- COURS ---

@app.post("/generate-course")
@limiter.limit("5/minute")
def create_course(
    request: Request,
    body: CourseRequest,
    current_user: models.User = Depends(require_role("STUDENT", "TEACHER", "ADMIN")),
    db: Session = Depends(get_db)
):
    try:
        content = ai_service.generate_course_content(body.topic, body.level)
        new_lesson = models.Lesson(title=body.topic, content=content, difficulty_level=body.level)
        db.add(new_lesson)
        db.commit()
        db.refresh(new_lesson)

        for chunk_text in ai_service.chunk_text(content):
            db.add(models.LessonChunk(
                lesson_id=new_lesson.id,
                content=chunk_text,
                embedding=ai_service.create_embeddings(chunk_text)
            ))

        questions = ai_service.generate_quiz_questions(body.topic, content, count=5)
        for q in questions:
            db.add(models.Question(
                lesson_id=new_lesson.id,
                text=q["text"],
                options=q["options"],
                correct_answer=q["correct_answer"],
                difficulty_b=q["difficulty_b"]
            ))

        db.commit()
        return {"status": "success", "lesson_id": str(new_lesson.id)}
    except Exception as e:
        import traceback
        traceback.print_exc()  # ← ajoute cette ligne
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/lessons")
def list_lessons(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    lessons = db.query(models.Lesson.id, models.Lesson.title).all()
    return [{"id": str(l.id), "title": l.title} for l in lessons]

@app.get("/lessons/{lesson_id}")
def get_lesson(
    lesson_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon non trouvée")
    return lesson

@app.get("/lessons/{lesson_id}/pdf")
def export_lesson_pdf(
    lesson_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon non trouvée")
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer)
    p.setFont("Helvetica-Bold", 16)
    p.drawString(100, 800, f"Cours : {lesson.title}")
    p.setFont("Helvetica", 12)
    y = 750
    for line in lesson.content.split('\n'):
        p.drawString(100, y, line[:80])
        y -= 20
        if y < 50:
            p.showPage()
            y = 800
    p.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={lesson.title}.pdf"})

# --- CHATBOT ---

@app.post("/chat")
@limiter.limit("20/minute")
def chat_with_course(
    request: Request,
    body: ChatRequestWithMode,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    question_vector = ai_service.create_embeddings(body.question)
    results = db.query(models.LessonChunk).filter(
        models.LessonChunk.lesson_id == body.lesson_id
    ).order_by(
        models.LessonChunk.embedding.l2_distance(question_vector)
    ).limit(3).all()

    answer = chat_service.chat_with_memory(
        session_id=body.session_id,
        question=body.question,
        context_chunks=results,
        mode=body.mode,
        pdf_base64=body.pdf_base64,
        pdf_name=body.pdf_name,
    )
    return {"answer": answer, "mode": body.mode}

@app.delete("/chat/session/{session_id}")
def clear_chat_session(
    session_id: str,
    current_user: models.User = Depends(get_current_user)
):
    chat_service.delete_session(session_id)
    return {"status": "session effacée"}

# --- QUIZ ---

@app.get("/quiz/next/{lesson_id}")
def get_next_question(
    lesson_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    questions = db.query(models.Question).filter(models.Question.lesson_id == lesson_id).all()
    next_q = quiz_service.select_next_question(questions, current_user.ability_theta)
    if not next_q:
        raise HTTPException(status_code=404, detail="Plus de questions disponibles")
    return {"id": str(next_q.id), "text": next_q.text, "options": next_q.options, "difficulty_b": next_q.difficulty_b}

@app.post("/quiz/submit")
def submit_answer(
    data: QuizSubmit,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    question = db.query(models.Question).filter(models.Question.id == data.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question introuvable")
    is_correct = (data.answer == question.correct_answer)
    current_user.ability_theta = quiz_service.update_student_theta(
        current_user.ability_theta, question.difficulty_b, is_correct
    )
    db.add(models.Attempt(user_id=current_user.id, question_id=question.id, is_correct=is_correct))
    db.commit()
    return {
        "is_correct": is_correct,
        "new_theta": current_user.ability_theta,
        "feedback": "Excellent ! Ton niveau progresse." if is_correct else f"Dommage. La bonne réponse était : {question.correct_answer}"
    }

# --- ANALYTICS ---

@app.post("/quiz/submit-open")
@limiter.limit("10/minute")
def submit_open_answer(
    request: Request,
    data: OpenQuestionSubmit,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    question = db.query(models.Question).filter(models.Question.id == data.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question introuvable")
 
    # Récupérer le contenu du cours pour contexte
    lesson = db.query(models.Lesson).filter(models.Lesson.id == question.lesson_id).first()
    context = lesson.content if lesson else ""
 
    result = ai_service.correct_open_question(question.text, data.answer, context)
 
    # Mise à jour IRT basée sur le score
    is_correct = result.get("is_correct", False)
    current_user.ability_theta = quiz_service.update_student_theta(
        current_user.ability_theta, question.difficulty_b, is_correct
    )
    db.add(models.Attempt(user_id=current_user.id, question_id=question.id, is_correct=is_correct))
    db.commit()
 
    return {
        "score": result.get("score", 0),
        "is_correct": is_correct,
        "feedback": result.get("feedback", ""),
        "correct_answer": result.get("correct_answer", ""),
        "new_theta": current_user.ability_theta
    }

@app.get("/stats")
def get_user_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    total = db.query(models.Attempt).filter(models.Attempt.user_id == current_user.id).count()
    correct = db.query(models.Attempt).filter(
        models.Attempt.user_id == current_user.id,
        models.Attempt.is_correct == True
    ).count()
    progress = max(0, min(100, int(((current_user.ability_theta + 3) / 6) * 100)))
    return {
        "theta": current_user.ability_theta,
        "progress_percent": progress,
        "total_attempts": total,
        "success_rate": round(correct / total * 100, 1) if total > 0 else 0
    }

@app.post("/lessons/{lesson_id}/reformulate")
def reformulate_lesson(
    lesson_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon non trouvée")
    reformulated = ai_service.reformulate_for_level(lesson.content, current_user.ability_theta)
    return {"content": reformulated, "theta_used": current_user.ability_theta}
 