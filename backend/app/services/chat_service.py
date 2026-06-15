import json
import os
import redis
from dotenv import load_dotenv

from openai import OpenAI
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)
load_dotenv()

r = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

SESSION_TTL = 60 * 60 * 24  # 24h


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


def chat_with_memory(session_id: str, question: str, context_chunks: list, mode: str = "normal") -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    history = get_session_history(session_id)
    context_text = "\n\n".join([c.content for c in context_chunks])

    mode_instructions = {
        "normal": "Réponds à la question de manière claire et précise.",
        "summary": "Fais un résumé synthétique en 5 points clés maximum sous forme de liste bullet.",
        "step_by_step": "Explique étape par étape avec des exemples à chaque étape.",
        "quiz_express": "Génère 3 questions rapides pour tester la compréhension. Format : Q: ... / Options: A... B... C... / Réponse: ..."
    }
    instruction = mode_instructions.get(mode, mode_instructions["normal"])

    messages = [
        {
            "role": "system",
            "content": f"Tu es un tuteur pédagogique. {instruction} Utilise UNIQUEMENT le contenu du cours suivant. Si la réponse n'y est pas, dis-le poliment.\n\nCONTENU DU COURS :\n{context_text}"
        }
    ]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": question})

    response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=messages,
    max_tokens=800,
    temperature=0.3
)
    answer = response.choices[0].message.content

    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": answer})
    save_session_history(session_id, history)

    return answer