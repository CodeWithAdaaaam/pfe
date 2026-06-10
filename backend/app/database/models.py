# -*- coding: utf-8 -*-
from sqlalchemy import Column, String, Float, Boolean, ForeignKey, Text, DateTime, JSON

from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector # L'extension pour le RAG
import uuid
from datetime import datetime

class Base(DeclarativeBase):
    pass

# --- TABLE UTILISATEUR ---
class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(String, default="STUDENT") # STUDENT, TEACHER, ADMIN
    
    # IRT Parameter: theta (la capacité estimée de l'étudiant)
    ability_theta = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)

# --- TABLES CONTENU & RAG ---
class Lesson(Base):
    __tablename__ = "lessons"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    content = Column(Text) # Le cours complet en Markdown
    difficulty_level = Column(String) # BEGINNER, INTERMEDIATE, ADVANCED
    
    # RAG chunks relationship
    chunks = relationship("LessonChunk", back_populates="lesson")
    questions = relationship("Question", back_populates="lesson")

class LessonChunk(Base):
    """Pour la recherche vectorielle (RAG)"""
    __tablename__ = "lesson_chunks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id"))
    content = Column(Text) # Le texte du morceau
    
    # Vecteur de 1536 dimensions (taille standard pour OpenAI text-embedding-3-small)
    embedding = Column(Vector(1536)) 
    
    lesson = relationship("Lesson", back_populates="chunks")

# --- TABLES QUIZ & IRT ---
class Question(Base):
    __tablename__ = "questions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id"))
    text = Column(Text, nullable=False)
    options = Column(JSON) # ["A", "B", "C", "D"]
    correct_answer = Column(String)
    
    # Paramètres IRT (Item Response Theory)
    difficulty_b = Column(Float, default=0.0) # b = difficulté de l'item
    discrimination_a = Column(Float, default=1.0) # a = discrimination
    
    lesson = relationship("Lesson", back_populates="questions")

class Attempt(Base):
    """Enregistre chaque réponse pour les analytics et l'évolution de l'IRT"""
    __tablename__ = "attempts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"))
    is_correct = Column(Boolean)
    response_time_seconds = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)