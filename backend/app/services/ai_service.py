import os
import random
from dotenv import load_dotenv
from openai import OpenAI

# Charger les variables d'environnement (.env)
load_dotenv()

# Initialiser le client OpenAI
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_course_content(topic: str, level: str):
    """Simule la génération de cours"""
    return f"""# Cours sur {topic}
## Niveau : {level}

Ceci est un contenu pédagogique simulé pour le projet LearnAI. 
Les algorithmes sont essentiels en informatique.
1. Concept 1 : La complexité.
2. Concept 2 : L'optimisation.

Résumé : Un bon algorithme est rapide et efficace.
"""

def create_embeddings(text: str):
    """Simule la création de vecteurs (1536 dimensions comme OpenAI)"""
    # On génère une liste de nombres aléatoires
    return [random.uniform(-1, 1) for _ in range(1536)]

def chunk_text(text: str, chunk_size: int = 500):
    """Découpe le texte"""
    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]  

def get_answer_from_context(question: str, context_chunks: list):
    """
    Simule la réponse du chatbot en utilisant les morceaux de cours trouvés.
    Plus tard, ce sera ici qu'on appellera OpenAI GPT-4o.
    """
    context_text = "\n".join([c.content for c in context_chunks])
    
    return f"En me basant sur le cours, voici la réponse à votre question '{question}' : \n\n[CONTEXTE DU COURS UTILISÉ] : {context_text[:200]}..."

def get_real_ai_answer(question: str, context_chunks: list):
    """
    Utilise OpenAI pour répondre à la question en utilisant UNIQUEMENT
    le contexte extrait de la base de données.
    """
    context_text = "\n".join([c.content for c in context_chunks])
    
    prompt = f"""
    Tu es un assistant pédagogique. Utilise les extraits de cours suivants pour répondre à la question de l'étudiant.
    Si la réponse n'est pas dans le contexte, dis-le poliment.
    
    CONTEXTE :
    {context_text}
    
    QUESTION : {question}
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "Tu es un tuteur utile."},
                  {"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content