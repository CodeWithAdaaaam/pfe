from app.database.session import SessionLocal
from app.database.models import LessonChunk
from app.services.ai_service import create_embeddings

db = SessionLocal()
chunks = db.query(LessonChunk).filter(LessonChunk.embedding.is_(None)).all()
for chunk in chunks:
    chunk.embedding = create_embeddings(chunk.content)
db.commit()
print(f"{len(chunks)} chunks mis à jour")