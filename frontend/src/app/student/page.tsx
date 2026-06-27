"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Loader2, ChevronRight, LogOut, User as UserIcon,
  TrendingUp, BrainCircuit, Wand2, FileDown, Sparkles,
  CheckCircle2, XCircle, HelpCircle, ArrowRight, RefreshCw,
  Plus, X, BookOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

const API = "http://127.0.0.1:8000";

type ChatMode = "normal" | "summary" | "step_by_step" | "quiz_express";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "summary", label: "Résumé" },
  { id: "step_by_step", label: "Pas à pas" },
  { id: "quiz_express", label: "Quiz" },
];

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Débutant",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé",
};

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {}),
    },
  });
};

export default function StudentDashboard() {
  const router = useRouter();

  const [level, setLevel] = useState("Débutant");
  const [lesson, setLesson] = useState<any>(null);
  const [lessonsList, setLessonsList] = useState<any[]>([]);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("normal");
  const sessionIdRef = useRef<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ correct: boolean; msg: string } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [stats, setStats] = useState({ theta: 0, progress_percent: 0, total_attempts: 0, success_rate: 0 });
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [reformulating, setReformulating] = useState(false);

  // ── MODAL STATE ──
  const [showModal, setShowModal] = useState(false);
  const [modalTopic, setModalTopic] = useState("");
  const [modalLevel, setModalLevel] = useState("BEGINNER");
  const [generating, setGenerating] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const email = localStorage.getItem("userEmail");
    if (!token) { router.push("/login"); return; }
    setUserName(localStorage.getItem("userName") || "Étudiant");
    setUserEmail(email || "");
    fetchLessons();
    fetchStats();
  }, [router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  const fetchStats = async () => {
    try {
      const res = await authFetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch { }
  };

  const fetchLessons = async () => {
    try {
      const res = await authFetch(`${API}/lessons`);
      if (res.ok) setLessonsList(await res.json());
    } catch { }
  };

  const loadLesson = async (id: string) => {
    setChatHistory([]);
    setShowQuiz(false);
    setQuizDone(false);
    setCurrentQuestion(null);
    setQuizFeedback(null);
    setAskedIds([]);
    sessionIdRef.current = `${id}_${Date.now()}`;
    try {
      const res = await authFetch(`${API}/lessons/${id}`);
      if (res.ok) {
        const data = await res.json();
        setLesson(data);
        setChatHistory([{ role: "ai", text: data.content }]);
      }
    } catch { }
  };

  // ── GENERATE COURSE FROM MODAL ──
  const generateCourse = async () => {
    if (!modalTopic.trim()) {
      setModalError("Veuillez entrer un sujet.");
      return;
    }
    setModalError("");
    setGenerating(true);
    try {
      const res = await authFetch(`${API}/generate-course`, {
        method: "POST",
        body: JSON.stringify({ topic: modalTopic.trim(), level: modalLevel }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      await fetchLessons();
      const lessonRes = await authFetch(`${API}/lessons/${data.lesson_id}`);
      const lessonData = await lessonRes.json();
      setLesson(lessonData);
      sessionIdRef.current = `${data.lesson_id}_${Date.now()}`;
      setChatHistory([{ role: "ai", text: lessonData.content }]);
      setShowModal(false);
      setModalTopic("");
      setModalLevel("BEGINNER");
    } catch {
      setModalError("Erreur lors de la génération. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !lesson) return;
    const userMsg = question.trim();
    setQuestion("");
    setChatHistory(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await authFetch(`${API}/chat`, {
        method: "POST",
        body: JSON.stringify({
          lesson_id: lesson.id,
          question: userMsg,
          mode: chatMode,
          session_id: sessionIdRef.current || "session_" + lesson.id,
        }),
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch {
      setChatHistory(prev => [...prev, { role: "ai", text: "Erreur." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const reformulate = async () => {
    if (!lesson) return;
    setReformulating(true);
    try {
      const res = await authFetch(`${API}/lessons/${lesson.id}/reformulate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, {
          role: "ai",
          text: `📘 **Cours reformulé pour ton niveau (θ = ${data.theta_used})** :\n\n${data.content}`,
        }]);
        fetchStats();
      }
    } catch { } finally { setReformulating(false); }
  };

  const startQuiz = async () => {
    setQuizLoading(true);
    setShowQuiz(true);
    setQuizFeedback(null);
    setCurrentQuestion(null);
    try {
      const res = await authFetch(`${API}/quiz/next/${lesson.id}?asked=${askedIds.join(",")}`);
      if (res.status === 404) {
        setShowQuiz(false);
        setQuizDone(true);
        setAskedIds([]);
        setChatHistory(prev => [...prev, { role: "ai", text: "🎉 Quiz terminé ! Tu as répondu à toutes les questions." }]);
        return;
      }
      if (res.ok) {
        const q = await res.json();
        setCurrentQuestion(q);
        setAskedIds(prev => [...prev, q.id]);
      }
    } finally { setQuizLoading(false); }
  };

  const submitAnswer = async (answer: string) => {
    if (quizFeedback || !currentQuestion) return;
    setQuizLoading(true);
    try {
      const res = await authFetch(`${API}/quiz/submit`, {
        method: "POST",
        body: JSON.stringify({ question_id: currentQuestion.id, user_email: userEmail, answer }),
      });
      const data = await res.json();
      setQuizFeedback({ correct: data.is_correct, msg: data.feedback });
      fetchStats();
    } finally { setQuizLoading(false); }
  };

  const exportPdf = async () => {
    if (!lesson) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API}/lessons/${lesson.id}/pdf`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lesson.title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Erreur lors de l'export PDF."); }
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">

      {/* MODAL GÉNÉRATION */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && !generating && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
            >
              {/* Header modal */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2.5 rounded-2xl">
                    <Sparkles size={22} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Générer un cours</h2>
                    <p className="text-xs text-slate-400 font-medium">Propulsé par LLaMA 3.3 70B</p>
                  </div>
                </div>
                {!generating && (
                  <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Champ sujet */}
              <div className="mb-4">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block">
                  Sujet du cours
                </label>
                <input
                  type="text"
                  value={modalTopic}
                  onChange={(e) => { setModalTopic(e.target.value); setModalError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && generateCourse()}
                  placeholder="Ex: Les réseaux de neurones, La cryptographie..."
                  disabled={generating}
                  className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 transition-all disabled:opacity-50 placeholder:text-slate-300"
                  autoFocus
                />
              </div>

              {/* Sélecteur niveau */}
              <div className="mb-6">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block">
                  Niveau
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setModalLevel(lvl)}
                      disabled={generating}
                      className={`py-3 rounded-2xl text-xs font-black uppercase transition-all border-2 ${
                        modalLevel === lvl
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100"
                          : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      {LEVEL_LABELS[lvl]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Erreur */}
              {modalError && (
                <p className="text-red-500 text-xs font-bold mb-4 flex items-center gap-1">
                  <XCircle size={14} /> {modalError}
                </p>
              )}

              {/* Bouton générer */}
              <button
                onClick={generateCourse}
                disabled={generating || !modalTopic.trim()}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 active:scale-95"
              >
                {generating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Générer le cours
                  </>
                )}
              </button>

              {generating && (
                <p className="text-center text-xs text-slate-400 mt-3 font-medium animate-pulse">
                  L'IA génère votre cours, vectorise le contenu et prépare le quiz...
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SIDEBAR */}
      <aside className="w-72 bg-indigo-950 text-white flex flex-col shrink-0 shadow-2xl z-30">
        <div className="p-8 flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-xl shadow-lg"><BrainCircuit size={28} /></div>
          <span className="font-black text-2xl tracking-tighter italic">LearnAI</span>
        </div>

        <div className="mx-6 mb-4 p-5 bg-indigo-900/50 rounded-3xl border border-indigo-800">
          <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase mb-3">
            <TrendingUp size={14} /> Score Maîtrise
          </div>
          <div className="text-3xl font-black mb-2">{stats.progress_percent}%</div>
          <div className="w-full bg-indigo-950 h-1.5 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${stats.progress_percent}%` }} className="bg-indigo-400 h-full" />
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-indigo-300 font-bold">
            <span>{stats.total_attempts} Tentatives</span>
            <span>{stats.success_rate}% Réussite</span>
          </div>
          <div className="mt-2 text-[10px] text-indigo-400 font-bold text-center">θ = {stats.theta}</div>
        </div>

        {/* Bouton Générer un cours */}
        <div className="mx-6 mb-4">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wide transition-all shadow-lg shadow-indigo-900/50 active:scale-95"
          >
            <Plus size={16} /> Générer un cours
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Mes Modules</p>
          <div className="space-y-1">
            {lessonsList.length === 0 && (
              <p className="text-indigo-600 text-xs text-center py-4 font-medium">Aucun cours pour l'instant</p>
            )}
            {lessonsList.map((l) => (
              <button key={l.id} onClick={() => loadLesson(l.id)}
                className={`w-full text-left p-3 rounded-xl text-sm transition-all flex items-center justify-between ${lesson?.id === l.id ? "bg-indigo-800 text-white shadow-lg" : "text-indigo-300 hover:bg-indigo-900/50"}`}>
                <span className="truncate font-medium flex items-center gap-2">
                  <BookOpen size={12} className="shrink-0" />
                  {l.title}
                </span>
                <ChevronRight size={14} className={lesson?.id === l.id ? "opacity-100" : "opacity-0"} />
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-indigo-900">
          <div className="flex items-center gap-3 mb-4 px-2 text-indigo-300">
            <UserIcon size={18} />
            <p className="text-sm font-bold truncate">{userName}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 p-3 text-sm text-indigo-400 hover:text-red-400 font-bold justify-center transition-colors">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ZONE CENTRALE */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden">

        <header className="h-20 px-10 flex items-center justify-between border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
            <Wand2 size={20} />
            {lesson ? lesson.title : "Bienvenue, " + userName}
          </h2>
          {lesson && (
            <div className="flex items-center gap-4">
              <button onClick={reformulate} disabled={reformulating}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-40">
                {reformulating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Reformuler
              </button>
              <button onClick={exportPdf} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                <FileDown size={16} /> Export PDF
              </button>
            </div>
          )}
        </header>

        {/* FIL DE CHAT */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          {chatHistory.length === 0 && !chatLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles size={64} className="text-indigo-200 mb-6" />
              <h1 className="text-4xl font-black text-slate-900 mb-4">Que souhaitez-vous apprendre ?</h1>
              <p className="text-slate-500 mb-8">Cliquez sur <strong>Générer un cours</strong> dans la barre latérale pour commencer.</p>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
              >
                <Plus size={20} /> Générer mon premier cours
              </button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-4 px-5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-slate-100 text-slate-800 rounded-tl-none prose prose-slate max-w-none"
                  }`}>
                    {msg.role === "ai" ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl rounded-tl-none p-4 flex gap-1">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150" />
                  </div>
                </div>
              )}

              {/* QUIZ */}
              {lesson && !quizDone && (
                <div className="mt-4">
                  {!showQuiz ? (
                    <button onClick={startQuiz} className="bg-emerald-600 text-white px-6 py-3 rounded-3xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg text-sm">
                      <HelpCircle size={18} /> Lancer le Quiz Adaptatif
                    </button>
                  ) : (
                    <div className="bg-slate-50 p-8 rounded-[40px] border-2 border-emerald-100 relative">
                      {quizLoading && !currentQuestion ? (
                        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
                      ) : currentQuestion && (
                        <div className="space-y-6">
                          <p className="text-xl font-bold text-slate-800">{currentQuestion.text}</p>
                          <div className="grid gap-3">
                            {currentQuestion.options.map((opt: string) => (
                              <button key={opt} onClick={() => submitAnswer(opt)} disabled={!!quizFeedback}
                                className={`text-left p-4 rounded-2xl border-2 transition-all font-bold ${quizFeedback ? "opacity-60 cursor-not-allowed" : "bg-white hover:border-emerald-500 hover:bg-emerald-50"}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                          {quizFeedback && (
                            <div className={`p-5 rounded-3xl flex items-center gap-4 ${quizFeedback.correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {quizFeedback.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                              <div className="flex-1 font-bold">{quizFeedback.msg}</div>
                              <button onClick={startQuiz} className="bg-white px-4 py-2 rounded-xl text-sm shadow-sm flex items-center gap-2">
                                Suivant <ArrowRight size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={() => setShowQuiz(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase">Fermer</button>
                    </div>
                  )}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* INPUT BAS — uniquement si un cours est chargé */}
        {lesson && (
          <div className="bg-white/80 backdrop-blur-md border-t p-6 pb-8 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-[2rem] border-2 border-slate-200 shadow-2xl p-2 focus-within:border-indigo-400 transition-all">
                <div className="flex items-center px-4 pt-2 gap-2">
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => setChatMode(m.id)}
                      className={`text-[10px] font-black px-3 py-1 rounded-full uppercase transition-all ${chatMode === m.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2">
                  <textarea
                    rows={1}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), askQuestion())}
                    placeholder="Posez une question sur le cours..."
                    className="flex-1 bg-transparent border-none outline-none p-3 text-sm resize-none"
                  />
                  <button onClick={askQuestion} disabled={chatLoading || !question.trim()}
                    className="bg-indigo-600 text-white p-4 rounded-[1.5rem] hover:bg-indigo-700 transition-all disabled:opacity-30 shadow-lg shadow-indigo-100 active:scale-95">
                    {chatLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-center text-slate-400 mt-3 font-bold uppercase tracking-widest">
                Appuyez sur Entrée pour envoyer · AI Powered Personalized Learning
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}