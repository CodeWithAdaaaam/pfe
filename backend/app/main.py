from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from sqlalchemy import func
from fastapi.responses import StreamingResponse
from reportlab.pdfgen import canvas
import io

from .database.session import SessionLocal
from .database import models
from .services import ai_service, quiz_service # Import du nouveau service quiz
from .core import security 

app = FastAPI(title="LearnAI API")

# Configuration du CORS pour Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SCHÉMAS DE DONNÉES (Pydantic) ---
class ChatRequest(BaseModel):
    lesson_id: str
    question: str

class CourseRequest(BaseModel):
    topic: str
    level: str

class UserSignup(BaseModel):
    email: str
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class QuizSubmit(BaseModel):
    question_id: str
    user_email: str
    answer: str

# --- DÉPENDANCE DB ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- ROUTES COURS & IA ---

@app.post("/generate-course")
def create_course(request: CourseRequest, db: Session = Depends(get_db)):
    try:
        # 1. Génération du texte du cours
        content = ai_service.generate_course_content(request.topic, request.level)
        
        # 2. Sauvegarde de la Leçon
        new_lesson = models.Lesson(
            title=request.topic, 
            content=content, 
            difficulty_level=request.level
        )
        db.add(new_lesson)
        db.commit()
        db.refresh(new_lesson)
        
        # 3. RAG : Découpage et Vectorisation
        chunks = ai_service.chunk_text(content)
        for chunk_text in chunks:
            vector = ai_service.create_embeddings(chunk_text)
            new_chunk = models.LessonChunk(
                lesson_id=new_lesson.id, 
                content=chunk_text, 
                embedding=vector
            )
            db.add(new_chunk)
        
        # 4. GÉNÉRATION DE QUESTIONS POUR LE QUIZ (Nouveau !)
        # On crée 3 questions de niveaux différents pour tester l'IRT
        difficulties = [ -1.0, 0.0, 1.0 ] # Facile, Moyen, Difficile
        for i, diff in enumerate(difficulties):
            new_q = models.Question(
                lesson_id=new_lesson.id,
                text=f"Question {i+1} sur {request.topic} (Difficulté: {diff})",
                options=["Option A (Correcte)", "Option B", "Option C", "Option D"],
                correct_answer="Option A (Correcte)",
                difficulty_b=diff
            )
            db.add(new_q)

        db.commit()
        return {"status": "success", "lesson_id": str(new_lesson.id)}
    except Exception as e:
        print(f"Erreur : {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/lessons")
def list_lessons(db: Session = Depends(get_db)):
    lessons = db.query(models.Lesson.id, models.Lesson.title).all()
    return [{"id": str(l.id), "title": l.title} for l in lessons]

@app.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: str, db: Session = Depends(get_db)):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Leçon non trouvée")
    return lesson

# --- ROUTES CHATBOT ---

@app.post("/chat")
def chat_with_course(request: ChatRequest, db: Session = Depends(get_db)):
    question_vector = ai_service.create_embeddings(request.question)
    
    results = db.query(models.LessonChunk).filter(
        models.LessonChunk.lesson_id == request.lesson_id
    ).order_by(
        models.LessonChunk.embedding.l2_distance(question_vector)
    ).limit(3).all()
    
    answer = ai_service.get_answer_from_context(request.question, results)
    
    return {
        "answer": answer,
        "sources_used": [str(c.id) for c in results]
    }

# --- ROUTES AUTHENTIFICATION ---

@app.post("/auth/signup")
def signup(user_data: UserSignup, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    
    new_user = models.User(
        email=user_data.email,
        hashed_password=security.hash_password(user_data.password),
        full_name=user_data.full_name,
        role="STUDENT"
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "message": "Compte créé !"}

@app.post("/auth/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == credentials.email).first()
    if not user or not security.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    
    access_token = security.create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"name": user.full_name, "email": user.email}
    }

# --- ROUTES QUIZ ADAPTATIF (IRT) ---

@app.get("/quiz/next/{lesson_id}")
def get_next_question(lesson_id: str, email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user: raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    questions = db.query(models.Question).filter(models.Question.lesson_id == lesson_id).all()
    
    # On utilise le service quiz pour choisir la question adaptée au theta de l'élève
    next_q = quiz_service.select_next_question(questions, user.ability_theta)
    
    if not next_q:
        raise HTTPException(status_code=404, detail="Plus de questions disponibles")
        
    return {
        "id": str(next_q.id),
        "text": next_q.text,
        "options": next_q.options,
        "difficulty_b": next_q.difficulty_b
    }

@app.post("/quiz/submit")
def submit_answer(data: QuizSubmit, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.user_email).first()
    question = db.query(models.Question).filter(models.Question.id == data.question_id).first()
    
    # Vérification de la réponse
    is_correct = (data.answer == question.correct_answer)
    
    # Mise à jour mathématique du niveau IRT (Theta)
    new_theta = quiz_service.update_student_theta(user.ability_theta, question.difficulty_b, is_correct)
    user.ability_theta = new_theta
    
    # Enregistrement de l'essai pour les statistiques
    attempt = models.Attempt(
        user_id=user.id, 
        question_id=question.id, 
        is_correct=is_correct
    )
    db.add(attempt)
    db.commit()
    
    return {
        "is_correct": is_correct,
        "new_theta": new_theta,
        "feedback": "Excellent ! Ton niveau progresse." if is_correct else f"Dommage. La bonne réponse était : {question.correct_answer}"
    }

# --- ROUTES ANALYTICS ---

@app.get("/stats/{email}")
def get_user_stats(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user: raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    total_attempts = db.query(models.Attempt).filter(models.Attempt.user_id == user.id).count()
    correct_attempts = db.query(models.Attempt).filter(models.Attempt.user_id == user.id, models.Attempt.is_correct == True).count()
    
    # Transformation de Theta (-3 à +3) en pourcentage (0 à 100)
    progress_percent = int(((user.ability_theta + 3) / 6) * 100)
    progress_percent = max(0, min(100, progress_percent))

    return {
        "theta": user.ability_theta,
        "progress_percent": progress_percent,
        "total_attempts": total_attempts,
        "success_rate": round((correct_attempts / total_attempts * 100), 1) if total_attempts > 0 else 0
    }

@app.get("/teacher/stats")
def get_teacher_stats(db: Session = Depends(get_db)):
    # 1. Nombre total d'étudiants
    total_students = db.query(models.User).filter(models.User.role == "STUDENT").count()
    
    # 2. Moyenne du niveau Theta de la classe
    avg_theta = db.query(func.avg(models.User.ability_theta)).filter(models.User.role == "STUDENT").scalar() or 0
    
    # 3. Les 5 cours les plus populaires
    popular_lessons = db.query(
        models.Lesson.title, 
        func.count(models.Attempt.id).label("attempts")
    ).join(models.Question).join(models.Attempt).group_by(models.Lesson.id).limit(5).all()

    return {
        "total_students": total_students,
        "average_theta": round(float(avg_theta), 2),
        "popular_lessons": popular_lessons
    }
@app.get("/lessons/{lesson_id}/pdf")
def export_lesson_pdf(lesson_id: str, db: Session = Depends(get_db)):
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id).first()
    
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer)
    p.setFont("Helvetica-Bold", 16)
    p.drawString(100, 800, f"Cours : {lesson.title}")
    p.setFont("Helvetica", 12)
    
    # On découpe le texte pour qu'il tienne dans le PDF
    y = 750
    for line in lesson.content.split('\n'):
        p.drawString(100, y, line[:80]) # Version simplifiée
        y -= 20
        if y < 50: p.showPage(); y = 800
        
    p.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={lesson.title}.pdf"})