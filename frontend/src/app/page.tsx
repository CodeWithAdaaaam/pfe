"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, Send, Plus, GraduationCap, MessageSquare, 
  History, Loader2, ChevronRight, LogOut, User as UserIcon,
  CheckCircle2, XCircle, HelpCircle, ArrowRight, TrendingUp, Target
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const router = useRouter();

  // --- ÉTATS GÉNÉRAUX ---
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("Débutant");
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<any>(null);
  const [lessonsList, setLessonsList] = useState<any[]>([]);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // --- ÉTATS CHATBOT ---
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{q: string, a: string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // --- ÉTATS QUIZ ADAPTATIF ---
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [quizFeedback, setQuizFeedback] = useState<{correct: boolean, msg: string} | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  // --- ÉTATS ANALYTICS ---
  const [stats, setStats] = useState({ 
    theta: 0, 
    progress_percent: 0, 
    total_attempts: 0, 
    success_rate: 0 
  });

  // --- PROTECTION DE ROUTE & INITIALISATION ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedName = localStorage.getItem("userName");
    const storedEmail = localStorage.getItem("userEmail");

    if (!token) {
      router.push("/login");
    } else {
      setUserName(storedName || "Étudiant");
      setUserEmail(storedEmail || "");
      fetchLessons();
      if (storedEmail) fetchStats(storedEmail);
    }
  }, [router]);

  // --- APPELS API ANALYTICS ---
  const fetchStats = async (email: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/stats/${email}`);
      const data = await res.json();
      setStats(data);
    } catch (e) { console.error("Erreur stats"); }
  };

  const fetchLessons = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/lessons");
      const data = await res.json();
      setLessonsList(data);
    } catch (e) { console.error("Erreur API Lessons"); }
  };

  const loadLesson = async (id: string) => {
    setLoading(true);
    setShowQuiz(false);
    setCurrentQuestion(null);
    setQuizFeedback(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/lessons/${id}`);
      const data = await res.json();
      setLesson(data);
      setChatHistory([]);
    } finally { setLoading(false); }
  };

  // --- ACTIONS COURS & CHAT ---
  const generateCourse = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level }),
      });
      const data = await res.json();
      await fetchLessons();
      await loadLesson(data.lesson_id);
      setTopic("");
    } finally { setLoading(false); }
  };

  const askQuestion = async () => {
    if (!lesson || !question) return;
    const q = question; setQuestion(""); setChatLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lesson.id, question: q }),
      });
      const data = await res.json();
      setChatHistory([...chatHistory, { q, a: data.answer }]);
    } finally { setChatLoading(false); }
  };

  // --- ACTIONS QUIZ ADAPTATIF (IRT) ---
  const startQuiz = async () => {
    setQuizLoading(true);
    setQuizFeedback(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/quiz/next/${lesson.id}?email=${userEmail}`);
      const data = await res.json();
      setCurrentQuestion(data);
    } finally { setQuizLoading(false); }
  };

  const submitAnswer = async (answer: string) => {
    if (quizFeedback) return;
    setQuizLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: currentQuestion.id,
          user_email: userEmail,
          answer: answer
        }),
      });
      const data = await res.json();
      setQuizFeedback({ correct: data.is_correct, msg: data.feedback });
      // On met à jour les stats globales immédiatement
      fetchStats(userEmail);
    } finally { setQuizLoading(false); }
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* 1. SIDEBAR GAUCHE (Navigation & Stats) */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-lg z-20">
        <div className="p-6 flex items-center gap-2 text-indigo-600">
          <GraduationCap size={32} strokeWidth={2.5} />
          <span className="font-bold text-2xl tracking-tight">LearnAI</span>
        </div>

        {/* Widget Stats IA */}
        <div className="mx-4 mb-6 p-5 bg-indigo-50 rounded-3xl border border-indigo-100 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <TrendingUp size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Niveau IA</span>
          </div>
          <div className="flex justify-between items-end mb-2">
            <span className="text-2xl font-black text-indigo-900">{stats.progress_percent}%</span>
            <span className="text-[10px] font-bold px-2 py-1 bg-white rounded-full text-indigo-500 shadow-sm">
              {stats.theta > 1 ? 'EXPERT' : stats.theta > -0.5 ? 'PRO' : 'APPRENTI'}
            </span>
          </div>
          <div className="w-full bg-indigo-200/50 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-600 h-full transition-all duration-1000 ease-out" style={{ width: `${stats.progress_percent}%` }}></div>
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-indigo-400 font-bold">
            <span className="flex items-center gap-1"><Target size={10}/> {stats.success_rate}% Réussite</span>
            <span>{stats.total_attempts} Questions</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">
              <History size={14} /> Historique des cours
            </div>
            <div className="space-y-1">
              {lessonsList.map((l) => (
                <button key={l.id} onClick={() => loadLesson(l.id)}
                  className={`w-full text-left p-3 rounded-xl text-sm transition-all flex items-center justify-between group ${lesson?.id === l.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}>
                  <span className="truncate font-medium">{l.title}</span>
                  <ChevronRight size={14} className={`${lesson?.id === l.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50/50">
          <div className="flex items-center gap-3 px-3 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm mb-3">
            <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><UserIcon size={20} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Session Étudiant</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 p-3 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-bold justify-center border border-transparent hover:border-red-100">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* 2. ZONE CENTRALE (Lecteur) */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        <header className="h-20 border-b border-slate-200 flex items-center justify-between px-10 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <input type="text" placeholder="Quel sujet voulez-vous explorer ?" value={topic} onChange={(e)=>setTopic(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-2xl px-6 py-3 text-sm focus:ring-2 ring-indigo-500 outline-none transition-all" />
            </div>
            <select className="bg-slate-100 border-none rounded-2xl px-4 py-3 text-sm font-bold outline-none cursor-pointer hover:bg-slate-200 transition-colors" value={level} onChange={(e)=>setLevel(e.target.value)}>
              <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option>
            </select>
            <button onClick={generateCourse} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-2xl transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 active:scale-95">
              {loading ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scroll-smooth">
          {lesson ? (
            <div className="max-w-3xl mx-auto">
              <article className="prose prose-slate prose-indigo lg:prose-xl mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <ReactMarkdown>{lesson.content}</ReactMarkdown>
              </article>

              {/* SECTION QUIZ ADAPTATIF */}
              <div className="mt-20 pt-10 border-t border-slate-100">
                {!showQuiz ? (
                  <div className="text-center">
                    <h4 className="text-xl font-black mb-4">Prêt pour un défi ?</h4>
                    <p className="text-slate-500 mb-8">Testez votre compréhension avec notre IA adaptative.</p>
                    <button onClick={startQuiz} className="bg-emerald-600 text-white px-10 py-5 rounded-3xl font-black hover:bg-emerald-700 transition-all flex items-center gap-3 mx-auto shadow-xl shadow-emerald-100 hover:-translate-y-1 active:translate-y-0">
                      <HelpCircle size={24} /> Lancer le Quiz Adaptatif
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-10 rounded-[40px] border-2 border-emerald-100 shadow-inner relative animate-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600"><CheckCircle2 size={24} /></div>
                        <h3 className="font-black text-xl text-emerald-900 tracking-tight">Question Adaptative</h3>
                      </div>
                      <button onClick={() => setShowQuiz(false)} className="text-slate-400 hover:text-slate-600 font-bold transition-colors">Fermer</button>
                    </div>

                    {quizLoading && !currentQuestion ? (
                      <div className="flex flex-col items-center justify-center p-10 gap-4">
                        <Loader2 className="animate-spin text-emerald-600" size={40} />
                        <p className="text-sm font-bold text-emerald-600 animate-pulse">L'IA prépare votre question...</p>
                      </div>
                    ) : currentQuestion && (
                      <div className="space-y-8">
                        <p className="text-2xl font-bold text-slate-800 leading-tight">{currentQuestion.text}</p>
                        <div className="grid gap-4">
                          {currentQuestion.options.map((opt: string) => (
                            <button key={opt} onClick={() => submitAnswer(opt)} disabled={!!quizFeedback}
                              className={`text-left p-5 rounded-2xl border-2 transition-all font-bold text-lg ${quizFeedback ? 'cursor-not-allowed opacity-60' : 'bg-white hover:border-emerald-500 hover:bg-emerald-50 shadow-sm active:scale-[0.98]'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>

                        {quizFeedback && (
                          <div className={`p-6 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-500 ${quizFeedback.correct ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                            <div className="p-2 bg-white rounded-full shadow-sm">
                              {quizFeedback.correct ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-red-500" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-lg">{quizFeedback.correct ? 'Excellent !' : 'Oups !'}</p>
                              <p className="text-sm opacity-90">{quizFeedback.msg}</p>
                            </div>
                            <button onClick={startQuiz} className="bg-white px-6 py-3 rounded-2xl text-sm font-black shadow-md flex items-center gap-2 hover:bg-slate-50 transition-colors">
                              Question Suivante <ArrowRight size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 animate-pulse">
              <BookOpen size={120} strokeWidth={0.5} className="mb-6 opacity-20" />
              <h2 className="text-2xl font-black text-slate-400">Votre futur commence ici.</h2>
              <p className="text-slate-400 font-medium">Générez ou sélectionnez un cours pour débuter l'apprentissage.</p>
            </div>
          )}
        </div>
      </main>

      {/* 3. SIDEBAR DROITE (Chatbot Contextuel) */}
      <aside className="w-96 bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-2xl">
        <div className="p-6 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100">
            <MessageSquare size={20} />
          </div>
          <h3 className="font-black text-slate-800 tracking-tight">Tuteur Intelligent</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {chatHistory.length === 0 && (
            <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 leading-relaxed italic">
                "Bonjour ! Je suis votre tuteur IA. Posez-moi n'importe quelle question sur le cours en cours, je vous répondrai en utilisant les données du module."
              </p>
            </div>
          )}
          {chatHistory.map((chat, i) => (
            <div key={i} className="flex flex-col gap-3 animate-in slide-in-from-right-2">
              <div className="self-end bg-indigo-600 text-white p-4 rounded-3xl rounded-tr-none text-sm max-w-[85%] shadow-md font-medium">
                {chat.q}
              </div>
              <div className="self-start bg-white border border-slate-100 p-4 rounded-3xl rounded-tl-none text-sm max-w-[85%] shadow-sm text-slate-700 leading-relaxed">
                <span className="text-indigo-600 font-black text-[10px] block mb-1 uppercase tracking-widest">Assistant LearnAI</span>
                {chat.a}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-2 p-4 bg-white rounded-3xl w-24 shadow-sm border border-slate-100">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
            </div>
          )}
        </div>

        <div className="p-6 bg-white border-t border-slate-200">
          <div className="relative group">
            <input type="text" placeholder="Posez une question sur le cours..." className="w-full bg-slate-100 border-none rounded-2xl px-5 py-4 pr-14 text-sm outline-none transition-all focus:ring-2 ring-indigo-500 shadow-inner"
              value={question} onChange={(e)=>setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askQuestion()} />
            <button onClick={askQuestion} className="absolute right-2 top-2 p-2 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-all hover:scale-110 active:scale-95">
              <Send size={20} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}