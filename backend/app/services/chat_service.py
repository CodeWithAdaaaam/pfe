import json
import os
import redis
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

SESSION_TTL = 60 * 60 * 24  # 24h

# Client Groq (OpenAI-compatible)
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)


def get_session_history(session_id: str) -> list[dict]:
    try:
        data = r.get(f"chat:{session_id}")
        return json.loads(data) if data else []
    except Exception:
        return []


def save_session_history(session_id: str, history: list[dict]):
    try:
        r.setex(f"chat:{session_id}", SESSION_TTL, json.dumps(history))
    except Exception:
        pass


def delete_session(session_id: str):
    try:
        r.delete(f"chat:{session_id}")
    except Exception:
        pass


def _extract_pdf_text(pdf_base64: str) -> str:
    """Extrait le texte d'un PDF encodé en base64 via pypdf."""
    try:
        import base64
        import io
        from pypdf import PdfReader

        pdf_bytes = base64.b64decode(pdf_base64)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(pages).strip()
        # Limiter à ~3000 chars pour ne pas exploser le contexte
        return text[:3000] if len(text) > 3000 else text
    except Exception as e:
        return f"[Impossible d'extraire le PDF : {e}]"


MODE_INSTRUCTIONS = {
    "normal":       "Réponds à la question de manière claire et précise.",
    "summary":      "Fais un résumé synthétique en 5 points clés maximum sous forme de liste bullet.",
    "step_by_step": "Explique étape par étape avec des exemples concrets à chaque étape.",
    "quiz_express": (
        "Génère 3 questions rapides pour tester la compréhension. "
        "Format strict :\nQ: ...\nOptions: A) ... B) ... C) ...\nRéponse: ..."
    ),
}


def chat_with_memory(
    session_id: str,
    question: str,
    context_chunks: list,
    mode: str = "normal",
    pdf_base64: str | None = None,
    pdf_name: str | None = None,
) -> str:
    history = get_session_history(session_id)
    context_text = "\n\n".join([c.content for c in context_chunks])
    instruction = MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["normal"])

    # Système de base
    system_parts = [
        f"Tu es un tuteur pédagogique expert. {instruction}",
        "Utilise UNIQUEMENT le contenu du cours (et le PDF joint si présent).",
        "Si la réponse n'y est pas, dis-le poliment.",
        f"\n--- CONTENU DU COURS ---\n{context_text}",
    ]

    # Si un PDF est joint, on l'extrait et on l'ajoute au contexte système
    if pdf_base64:
        pdf_text = _extract_pdf_text(pdf_base64)
        fname = pdf_name or "document.pdf"
        system_parts.append(f"\n--- PDF JOINT : {fname} ---\n{pdf_text}")

    system_prompt = "\n".join(system_parts)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": question})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=800,
        temperature=0.3,
    )
    answer = response.choices[0].message.content

    # Sauvegarder dans l'historique (sans le PDF pour économiser Redis)
    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": answer})
    save_session_history(session_id, history)

    return answer