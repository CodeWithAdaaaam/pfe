import math

def update_student_theta(current_theta: float, question_difficulty: float, is_correct: bool):
    """
    Version simplifiée de l'IRT (Stochastic Gradient Descent).
    Met à jour la capacité (theta) de l'étudiant.
    """
    k = 0.5 # Facteur d'apprentissage (vitesse d'évolution)
    
    # Probabilité de réussite théorique (Fonction logistique)
    p_success = 1 / (1 + math.exp(-(current_theta - question_difficulty)))
    
    actual_score = 1.0 if is_correct else 0.0
    
    # Nouvelle estimation de theta
    new_theta = current_theta + k * (actual_score - p_success)
    
    return round(new_theta, 2)

def select_next_question(questions: list, student_theta: float, asked_ids: set = None):
    if asked_ids is None:
        asked_ids = set()
    remaining = [q for q in questions if str(q.id) not in asked_ids]
    if not remaining:
        return None
    return min(remaining, key=lambda q: abs(q.difficulty_b - student_theta))