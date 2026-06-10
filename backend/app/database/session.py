from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .models import Base
import os

# Configuration de la base de données
DATABASE_URL = "postgresql://postgres.xtdbsxfptsgnlgmmijxl:tyyarazwina@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

# 1. Création de l'engine
engine = create_engine(DATABASE_URL)

# 2. Création de la SessionLocal (C'est ce qui manquait !)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        Base.metadata.create_all(bind=engine)
        print("✅ Base de données prête.")
    except Exception as e:
        print(f"❌ Erreur : {e}")

if __name__ == "__main__":
    init_db()