import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

HF_TOKEN = os.getenv("HF_TOKEN")
HF_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"


def create_embeddings(text: str) -> list[float]:
    response = requests.post(
        HF_URL,
        headers={"Authorization": f"Bearer {HF_TOKEN}"},
        json={"inputs": text}
    )
    result = response.json()
    if isinstance(result, list):
        return result if isinstance(result[0], float) else result[0]
    raise ValueError(f"HuggingFace embeddings error: {result}")


def generate_course_content(topic: str, level: str) -> str:
    prompt = f"""Tu es un professeur expert. Génère un cours complet et structuré en Markdown sur le sujet : "{topic}".
Niveau cible : {level} (BEGINNER = débutant, INTERMEDIATE = intermédiaire, ADVANCED = avancé).

Structure obligatoire :
# Titre du cours
## Introduction
## Concepts clés (avec exemples concrets)
## Approfondissement
## Résumé
## Points à retenir (liste bullet)

Adapte le vocabulaire et la profondeur au niveau {level}. Réponds uniquement en Markdown."""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000, temperature=0.7
    )
    return response.choices[0].message.content


def reformulate_for_level(content: str, detected_theta: float) -> str:
    if detected_theta > 1:
        level_label = "expert — utilise un vocabulaire technique avancé, va droit au but"
    elif detected_theta > 0:
        level_label = "intermédiaire — explique les concepts sans trop simplifier"
    elif detected_theta > -1:
        level_label = "débutant — explique simplement avec des analogies et exemples concrets"
    else:
        level_label = "grand débutant — vulgarise au maximum, évite tout jargon"

    prompt = f"""Tu es un professeur. Reformule ce cours pour un étudiant de niveau {level_label}.
Garde la même structure Markdown mais adapte le vocabulaire, la profondeur et les exemples.

COURS ORIGINAL :
{content[:3000]}"""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000, temperature=0.5
    )
    return response.choices[0].message.content


def generate_quiz_questions(topic: str, content: str, count: int = 5) -> list[dict]:
    prompt = f"""Tu es un expert en évaluation pédagogique. Génère exactement {count} questions QCM basées sur ce cours.

SUJET : {topic}
CONTENU : {content[:3000]}

Génère des questions de difficultés variées :
- 2 questions faciles (difficulty_b: -1.0)
- 2 questions moyennes (difficulty_b: 0.0)
- 1 question difficile (difficulty_b: 1.5)

Réponds UNIQUEMENT avec un JSON valide, sans markdown :
[{{"text": "?", "options": ["A","B","C","D"], "correct_answer": "A", "difficulty_b": -1.0}}]"""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000, temperature=0.7
    )
    raw = response.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
    return json.loads(raw)


def correct_open_question(question: str, student_answer: str, context: str) -> dict:
    prompt = f"""Tu es un correcteur pédagogique expert. Évalue la réponse de l'étudiant.

QUESTION : {question}
RÉPONSE DE L'ÉTUDIANT : {student_answer}
CONTENU DU COURS (référence) : {context[:2000]}

Réponds UNIQUEMENT en JSON valide :
{{
  "score": 0.8,
  "is_correct": true,
  "feedback": "Explication détaillée...",
  "correct_answer": "La réponse idéale complète..."
}}

score est entre 0.0 et 1.0. is_correct = true si score >= 0.6."""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600, temperature=0.2
    )
    raw = response.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
    return json.loads(raw)


def get_answer_from_context(question: str, context_chunks: list, mode: str = "normal") -> str:
    context_text = "\n\n".join([c.content for c in context_chunks])
    mode_instructions = {
        "normal": "Réponds à la question de manière claire et précise.",
        "summary": "Fais un résumé synthétique du cours en 5 points clés maximum, sous forme de liste bullet.",
        "step_by_step": "Explique le concept demandé étape par étape, de manière très détaillée avec des exemples à chaque étape.",
        "quiz_express": "Génère 3 questions rapides (QCM) basées sur ce contenu pour tester la compréhension. Format: Q: ... / A: ... B: ... C: ... / Réponse: ..."
    }
    instruction = mode_instructions.get(mode, mode_instructions["normal"])
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": f"Tu es un tuteur pédagogique. {instruction} Utilise UNIQUEMENT le contexte fourni."},
            {"role": "user", "content": f"CONTEXTE :\n{context_text}\n\nDEMANDE : {question}"}
        ],
        max_tokens=800, temperature=0.3
    )
    return response.choices[0].message.content


def chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    chunks, overlap, i = [], 50, 0
    while i < len(text):
        chunks.append(text[i:i + chunk_size])
        i += chunk_size - overlap
    return chunks