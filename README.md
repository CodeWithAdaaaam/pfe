# LearnAI — Plateforme d'apprentissage adaptative par IA

> Projet de Fin d'Études — SupMTI 2025/2026  
> Étudiant : Adam — Filière Ingénierie Informatique

---

## Présentation

LearnAI est une plateforme web d'apprentissage adaptatif propulsée par l'intelligence artificielle. Elle génère des cours personnalisés, adapte les quiz au niveau réel de chaque étudiant via la **Théorie de Réponse à l'Item (IRT)**, et propose un chatbot pédagogique contextuel basé sur la **Recherche Augmentée par Génération (RAG)**.

Le système est multi-rôles (Étudiant / Enseignant / Admin) et inclut un tableau de bord analytique complet pour le suivi de la progression.

---

## Fonctionnalités principales

### F1 — Génération de cours par IA
- Génération de contenu pédagogique structuré en Markdown via GPT/Groq LLaMA
- Niveaux : Débutant, Intermédiaire, Avancé
- Chunking automatique du contenu + vectorisation pour le RAG
- Export PDF du cours

### F2 — Quiz adaptatif (IRT)
- Sélection de la prochaine question basée sur la proximité entre la difficulté `b` et le niveau `θ` (theta) de l'étudiant
- Mise à jour de theta après chaque réponse (descente de gradient stochastique)
- Support des questions QCM et questions ouvertes (corrigées par IA)
- Feedback instantané avec score et réponse correcte

### F3 — Chatbot pédagogique RAG
- Recherche vectorielle sur les chunks du cours (pgvector, distance L2)
- Mémoire de session persistée dans Redis (TTL 24h)
- 4 modes : `normal`, `summary`, `step_by_step`, `quiz_express`
- Réinitialisation de session à la demande

### F4 — Dashboard analytique
- **Enseignant** : vue globale (theta moyen, cours populaires, liste étudiants, heatmap des questions difficiles, recommandations, progression 14 jours)
- **Étudiant** : statistiques personnelles (theta, taux de réussite, tentatives)
- **Admin** : gestion des utilisateurs

---

## Architecture

```
learn-ai-pfe/
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── main.py             # Entrée API + routes principales
│   │   ├── core/
│   │   │   ├── security.py     # JWT, bcrypt
│   │   │   └── dependencies.py # get_db, get_current_user, require_role
│   │   ├── database/
│   │   │   ├── models.py       # SQLAlchemy (User, Lesson, LessonChunk, Question, Attempt)
│   │   │   └── session.py      # Engine + SessionLocal
│   │   ├── routers/
│   │   │   └── teacher.py      # Routes TEACHER/ADMIN (stats, CRUD étudiants, heatmap)
│   │   └── services/
│   │       ├── ai_service.py   # GPT/Groq : génération cours, quiz, correction, embeddings
│   │       ├── chat_service.py # RAG + mémoire Redis
│   │       ├── quiz_service.py # IRT : update_theta, select_next_question
│   │       └── irt_service.py  # Calculs IRT avancés
│   ├── alembic/                # Migrations base de données
│   ├── requirements.txt
│   └── conftest.py
│
├── frontend/                   # Next.js 14 App Router
│   └── src/app/
│       ├── login/              # Authentification
│       ├── signup/             # Inscription
│       ├── student/            # Dashboard étudiant
│       ├── teacher/            # Dashboard enseignant
│       └── admin/              # Dashboard admin
│
└── .github/workflows/
    └── ci.yml                  # CI/CD : tests → deploy VPS + Vercel
```

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| Base de données | PostgreSQL + pgvector (Supabase) |
| Cache / Sessions | Redis |
| IA | Groq (LLaMA 3.3 70B) + OpenAI GPT-4o |
| Embeddings | `sentence-transformers` (384 dim, local) |
| Auth | JWT (HS256) + bcrypt |
| Migrations | Alembic |
| CI/CD | GitHub Actions → VPS Hostinger + Vercel |
| Rate limiting | slowapi |

---

## Modèle de données

```
User          id, email, hashed_password, full_name, role, ability_theta
Lesson        id, title, content (Markdown), difficulty_level
LessonChunk   id, lesson_id, content, embedding (Vector 384)
Question      id, lesson_id, text, options (JSON), correct_answer, difficulty_b, discrimination_a
Attempt       id, user_id, question_id, is_correct, response_time_seconds, timestamp
```

---

## RBAC — Contrôle d'accès par rôle

| Route | STUDENT | TEACHER | ADMIN |
|-------|---------|---------|-------|
| `POST /generate-course` | ✅ | ✅ | ✅ |
| `GET /lessons` | ✅ | ✅ | ✅ |
| `POST /chat` | ✅ | ✅ | ✅ |
| `GET /quiz/next/:id` | ✅ | ✅ | ✅ |
| `POST /quiz/submit` | ✅ | ✅ | ✅ |
| `GET /teacher/stats` | ❌ | ✅ | ✅ |
| `GET /teacher/students` | ❌ | ✅ | ✅ |
| `DELETE /teacher/students/:id` | ❌ | ✅ | ✅ |

---

## IRT — Théorie de Réponse à l'Item

LearnAI implémente un modèle IRT à 2 paramètres (2PL) simplifié :

**Probabilité de réussite :**
```
P(θ) = 1 / (1 + exp(-(θ - b)))
```

**Mise à jour de theta (SGD) :**
```
θ_new = θ + k × (score_réel - P(θ))    avec k = 0.5
```

- `θ` : capacité estimée de l'étudiant (initialisée à 0)
- `b` : difficulté de la question
- La question sélectionnée est celle dont `|b - θ|` est minimal

---

## Prérequis

- Python 3.12+
- Node.js 20+
- PostgreSQL avec extension `pgvector`
- Redis
- Clés API : Groq, OpenAI (optionnel)

---

## Installation

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Créer un fichier `.env` :

```env
DATABASE_URL=postgresql://user:password@host:5432/learnai_db
REDIS_HOST=localhost
REDIS_PORT=6379
GROQ_API_KEY=votre_clé_groq
OPENAI_API_KEY=votre_clé_openai
SECRET_KEY=votre_secret_jwt
```

Appliquer les migrations :

```bash
alembic upgrade head
```

Lancer le serveur :

```bash
uvicorn app.main:app --reload
```

API disponible sur `http://localhost:8000` — Documentation : `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
```

Créer un fichier `.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Lancer :

```bash
npm run dev
```

Frontend disponible sur `http://localhost:3000`

---

## Tests

```bash
cd backend
pytest app/tests/ -v --tb=short
```

---

## CI/CD

Le pipeline GitHub Actions (`main` branch) exécute :

1. **Tests backend** — FastAPI + pytest sur PostgreSQL/Redis éphémères
2. **Tests frontend** — TypeScript check + build Next.js
3. **Deploy backend** → VPS Hostinger via SSH + pm2
4. **Deploy frontend** → Vercel

Secrets GitHub à configurer : `OPENAI_API_KEY`, `GROQ_API_KEY`, `SECRET_KEY`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

---

## Hors périmètre MVP

- Application mobile
- Vidéo / visioconférence
- Système de paiement

---

## Licence

Projet académique — SupMTI 2025/2026. Tous droits réservés