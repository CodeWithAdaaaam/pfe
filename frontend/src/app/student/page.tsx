"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BookOpen, Send, Plus, GraduationCap, MessageSquare, 
  History, Loader2, ChevronRight, LogOut, User as UserIcon,
  CheckCircle2, XCircle, HelpCircle, ArrowRight, TrendingUp, 
  Target, RefreshCw, FileText, List, Footprints, Zap
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ChatMode = "normal" | "summary" | "step_by_step" | "quiz_express";

const MODES: { id: ChatMode; label: string; icon: any; color: string }[] = [
  { id: "normal",        label: "Normal",      icon: MessageSquare, color: "indigo" },
  { id: "summary",       label: "Résumé",      icon: List,          color: "emerald" },
  { id: "step_by_step",  label: "Pas à pas",   icon: Footprints,    color: "amber" },
  { id: "quiz_express",  label: "Quiz express", icon: Zap,           color: "purple" },
];

export default function Home() {
  const router = useRouter();

  const [topic, setTopic]           = useState("");
  const [level, setLevel]           = useState("Débutant");
  const [loading, setLoading]       = useState(false);
  const [lesson, setLesson]         = useState<any>(null);
  const [lessonsList, setLessonsList] = useState<any[]>([]);
  const [userName, setUserName]     = useState("");

  const [question, setQuestion]     = useState("");
  const [chatHistory, setChatHistory] = useState<{q: string; a: string; mode: ChatMode}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMode, setChatMode]     = useState<ChatMode>("normal");
  const sessionIdRef                = useRef<string>("");

  const [showQuiz, setShowQuiz]     = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [quizFeedback, setQuizFeedback] = useState<{correct: boolean; msg: string; score?: number} | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [reformulating, setReformulating] = useState(false);

  const [stats, setStats] = useState({ theta: 0, progress_percent: 0, total_attempts: 0, success_rate: 0 });

  const authFetch = (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    return fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...options.headers }
    });
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    const role = localStorage.getItem("userRole");
    if (role === "TEACHER" || role === "ADMIN") {
      router.push("/teacher");
      return;
    }

    setUserName(localStorage.getItem("userName") || "Étudiant");
    fetchLessons();
    fetchStats();
  }, [router]);

  const fetchStats = async () => {
    try {
      const res = await authFetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const fetchLessons = async () => {
    try {
      const res = await authFetch(`${API}/lessons`);
      if (res.ok) setLessonsList(await res.json());
    } catch {}
  };

  const loadLesson = async (id: string) => {
    setLoading(true);
    setShowQuiz(false);
    setCurrentQuestion(null);
    setQuizFeedback(null);
    setChatHistory([]);
    sessionIdRef.current = `${id}_${Date.now()}`;
    try {
      const res = await authFetch(`${API}/lessons/${id}`);
      if (res.ok) setLesson(await res.json());
    } finally { setLoading(false); }
  };

  const generateCourse = async () => {
  if (!topic) return;
  setLoading(true);
  try {
    const token = localStorage.getItem("token");
    console.log("Token:", token); // ← vérifie dans la console browser
    const res = await authFetch(`${API}/generate-course`, {
      method: "POST",
      body: JSON.stringify({ topic, level }),
    });
    console.log("Status:", res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await fetchLessons();
      await loadLesson(data.lesson_id);
      setTopic("");
    } finally { setLoading(false); }
  };

  // F1 — Reformulation selon niveau IRT
  const reformulateLesson = async () => {
    if (!lesson) return;
    setReformulating(true);
    try {
      const res = await authFetch(`${API}/lessons/${lesson.id}/reformulate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLesson((prev: any) => ({ ...prev, content: data.content }));
      }
    } finally { setReformulating(false); }
  };

  // F3 — Chat avec mode
  const askQuestion = async () => {
    if (!lesson || !question) return;
    const q = question;
    setQuestion("");
    setChatLoading(true);
    try {
      const res = await authFetch(`${API}/chat`, {
        method: "POST",
        body: JSON.stringify({ lesson_id: lesson.id, question: q, session_id: sessionIdRef.current, mode: chatMode }),
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { q, a: data.answer, mode: chatMode }]);
    } finally { setChatLoading(false); }
  };

  const startQuiz = async () => {
    if (!lesson) return;
    setShowQuiz(true);
    setQuizLoading(true);
    setQuizFeedback(null);
    setCurrentQuestion(null);
    try {
      const res = await authFetch(`${API}/quiz/next/${lesson.id}`);
      if (res.ok) setCurrentQuestion(await res.json());
    } finally { setQuizLoading(false); }
  };

  const submitAnswer = async (answer: string) => {
    if (quizFeedback || !currentQuestion) return;
    setQuizLoading(true);
    try {
      const res = await authFetch(`${API}/quiz/submit`, {
        method: "POST",
        body: JSON.stringify({ question_id: currentQuestion.id, answer }),
      });
      const data = await res.json();
      setQuizFeedback({ correct: data.is_correct, msg: data.feedback });
      fetchStats();
    } finally { setQuizLoading(false); }
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  const modeColors: Record<ChatMode, string> = {
    normal: "bg-indigo-600",
    summary: "bg-emerald-600",
    step_by_step: "bg-amber-500",
    quiz_express: "bg-purple-600",
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* SIDEBAR GAUCHE */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-lg z-20">
        <div className="p-6 flex items-center gap-2 text-indigo-600">
          <GraduationCap size={32} strokeWidth={2.5} />
          <span className="font-bold text-2xl tracking-tight">LearnAI</span>
        </div>

        <div className="mx-4 mb-6 p-5 bg-indigo-50 rounded-3xl border border-indigo-100 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <TrendingUp size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Niveau IA</span>
          </div>
          <div className="flex justify-between items-end mb-2">
            <span className="text-2xl font-black text-indigo-900">{stats.progress_percent}%</span>
            <span className="text-[10px] font-bold px-2 py-1 bg-white rounded-full text-indigo-500 shadow-sm">
              {stats.theta > 1 ? 'EXPERT' : stats.theta > 0 ? 'AVANCÉ' : stats.theta > -1 ? 'INTER.' : 'DÉBUTANT'}
            </span>
          </div>
          <div className="w-full bg-indigo-200/50 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-600 h-full transition-all duration-1000" style={{ width: `${stats.progress_percent}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-indigo-400 font-bold">
            <span className="flex items-center gap-1"><Target size={10}/> {stats.success_rate}% Réussite</span>
            <span>{stats.total_attempts} Questions</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">
            <History size={14} /> Historique
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

        <div className="p-4 border-t bg-slate-50/50">
          <div className="flex items-center gap-3 px-3 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm mb-3">
            <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><UserIcon size={20} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Session Étudiant</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 p-3 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-bold justify-center">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ZONE CENTRALE */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        <header className="h-20 border-b border-slate-200 flex items-center px-10 gap-4 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="relative flex-1 max-w-md">
            <input type="text" placeholder="Quel sujet voulez-vous explorer ?" value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateCourse()}
              className="w-full bg-slate-100 rounded-2xl px-6 py-3 text-sm focus:ring-2 ring-indigo-500 outline-none" />
          </div>
          <select className="bg-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none cursor-pointer"
            value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option>
          </select>
          <button onClick={generateCourse} disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-2xl transition-all shadow-lg disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12">
          {lesson ? (
            <div className="max-w-3xl mx-auto">

              {/* Bouton reformulation F1 */}
              <div className="flex justify-end mb-4">
                <button onClick={reformulateLesson} disabled={reformulating}
                  className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-4 py-2 rounded-xl transition-all">
                  {reformulating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Adapter à mon niveau
                </button>
              </div>

              <article className="prose prose-slate prose-indigo lg:prose-xl mb-20">
                <ReactMarkdown>{lesson.content}</ReactMarkdown>
              </article>

              {/* QUIZ */}
              <div className="mt-20 pt-10 border-t border-slate-100">
                {!showQuiz ? (
                  <div className="text-center">
                    <h4 className="text-xl font-black mb-4">Prêt pour un défi ?</h4>
                    <p className="text-slate-500 mb-8">Testez votre compréhension avec notre IA adaptative.</p>
                    <button onClick={startQuiz}
                      className="bg-emerald-600 text-white px-10 py-5 rounded-3xl font-black hover:bg-emerald-700 transition-all flex items-center gap-3 mx-auto shadow-xl">
                      <HelpCircle size={24} /> Lancer le Quiz Adaptatif
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-10 rounded-[40px] border-2 border-emerald-100 shadow-inner">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600"><CheckCircle2 size={24} /></div>
                        <h3 className="font-black text-xl text-emerald-900">Question Adaptative</h3>
                      </div>
                      <button onClick={() => setShowQuiz(false)} className="text-slate-400 hover:text-slate-600 font-bold">Fermer</button>
                    </div>

                    {quizLoading && !currentQuestion ? (
                      <div className="flex flex-col items-center p-10 gap-4">
                        <Loader2 className="animate-spin text-emerald-600" size={40} />
                        <p className="text-sm font-bold text-emerald-600 animate-pulse">L'IA prépare votre question...</p>
                      </div>
                    ) : currentQuestion && (
                      <div className="space-y-8">
                        <p className="text-2xl font-bold text-slate-800">{currentQuestion.text}</p>
                        <div className="grid gap-4">
                          {currentQuestion.options.map((opt: string) => (
                            <button key={opt} onClick={() => submitAnswer(opt)} disabled={!!quizFeedback}
                              className={`text-left p-5 rounded-2xl border-2 transition-all font-bold text-lg ${quizFeedback ? 'cursor-not-allowed opacity-60' : 'bg-white hover:border-emerald-500 hover:bg-emerald-50 shadow-sm'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>

                        {quizFeedback && (
                          <div className={`p-6 rounded-3xl flex items-center gap-4 ${quizFeedback.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            <div className="p-2 bg-white rounded-full shadow-sm">
                              {quizFeedback.correct ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-red-500" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-lg">{quizFeedback.correct ? 'Excellent !' : 'Oups !'}</p>
                              <p className="text-sm opacity-90">{quizFeedback.msg}</p>
                            </div>
                            <button onClick={startQuiz} className="bg-white px-6 py-3 rounded-2xl text-sm font-black shadow-md flex items-center gap-2">
                              Suivante <ArrowRight size={18} />
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
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <BookOpen size={120} strokeWidth={0.5} className="mb-6 opacity-20" />
              <h2 className="text-2xl font-black text-slate-400">Votre futur commence ici.</h2>
              <p className="text-slate-400 font-medium">Générez ou sélectionnez un cours pour débuter.</p>
            </div>
          )}
        </div>
      </main>

      {/* SIDEBAR DROITE — CHATBOT */}
      <aside className="w-96 bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-2xl">
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white"><MessageSquare size={18} /></div>
            <h3 className="font-black text-slate-800">Tuteur Intelligent</h3>
          </div>
          {/* Sélecteur de mode F3 */}
          <div className="grid grid-cols-4 gap-1">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setChatMode(id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-[10px] font-bold transition-all ${
                  chatMode === id ? `${modeColors[id]} text-white shadow-sm` : 'text-slate-400 hover:bg-slate-100'
                }`}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.length === 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 italic">Bonjour ! Sélectionnez un mode et posez votre question sur le cours.</p>
            </div>
          )}
          {chatHistory.map((chat, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-1 self-end">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full text-white ${modeColors[chat.mode]}`}>
                  {MODES.find(m => m.id === chat.mode)?.label}
                </span>
              </div>
              <div className="self-end bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none text-sm max-w-[85%] font-medium">
                {chat.q}
              </div>
              <div className="self-start bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none text-sm max-w-[85%] shadow-sm text-slate-700 leading-relaxed">
                <span className="text-indigo-600 font-black text-[9px] block mb-1 uppercase tracking-widest">Assistant LearnAI</span>
                {chat.a}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-1.5 p-3 bg-white rounded-2xl w-20 shadow-sm border border-slate-100">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75" />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150" />
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <div className="relative">
            <input type="text" placeholder={`Mode : ${MODES.find(m => m.id === chatMode)?.label}...`}
              className="w-full bg-slate-100 rounded-2xl px-4 py-3 pr-12 text-sm outline-none focus:ring-2 ring-indigo-500"
              value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askQuestion()} />
            <button onClick={askQuestion}
              className={`absolute right-2 top-2 p-2 text-white rounded-xl transition-all ${modeColors[chatMode]}`}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}