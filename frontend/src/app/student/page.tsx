"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Send, Plus, GraduationCap, MessageSquare,
  History, Loader2, ChevronRight, LogOut, User as UserIcon,
  CheckCircle2, XCircle, HelpCircle, ArrowRight, TrendingUp,
  Target, RefreshCw, FileText, List, Footprints, Zap,
  Paperclip, X, Sparkles, BrainCircuit, Wand2, FileDown
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL;
type ChatMode = "normal" | "summary" | "step_by_step" | "quiz_express";

const MODES: { id: ChatMode; label: string; icon: any; accent: string }[] = [
  { id: "normal", label: "Normal", icon: MessageSquare, accent: "bg-indigo-600" },
  { id: "summary", label: "Résumé", icon: List, accent: "bg-emerald-600" },
  { id: "step_by_step", label: "Pas à pas", icon: Footprints, accent: "bg-amber-500" },
  { id: "quiz_express", label: "Quiz", icon: Zap, accent: "bg-purple-600" },
];

export default function Home() {
  const router = useRouter();

  // --- ÉTATS ---
  const [level, setLevel] = useState("Débutant");
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<any>(null);
  const [lessonsList, setLessonsList] = useState<any[]>([]);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{
    role: "user" | "ai";
    text: string;
    mode?: ChatMode;
    isSystem?: boolean;
  }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("normal");
  const sessionIdRef = useRef<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [attachedPdf, setAttachedPdf] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState("");

  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ correct: boolean; msg: string } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [reformulating, setReformulating] = useState(false);

  const [stats, setStats] = useState({
    theta: 0, progress_percent: 0, total_attempts: 0, success_rate: 0,
  });

  // --- AUTH & INIT ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setUserName(localStorage.getItem("userName") || "Étudiant");
    setUserEmail(localStorage.getItem("userEmail") || "");
    fetchLessons();
    fetchStats();
  }, [router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  const fetchStats = async () => {
    const email = localStorage.getItem("userEmail");
    try {
      const res = await fetch(`${API}/stats/${email}`);
      if (res.ok) setStats(await res.json());
    } catch { }
  };

  const fetchLessons = async () => {
    try {
      const res = await fetch(`${API}/lessons`);
      if (res.ok) setLessonsList(await res.json());
    } catch { }
  };

  const loadLesson = async (id: string) => {
    setLoading(true);
    setShowQuiz(false);
    setChatHistory([]);
    sessionIdRef.current = `${id}_${Date.now()}`;
    try {
      const res = await fetch(`${API}/lessons/${id}`);
      if (res.ok) setLesson(await res.json());
    } finally { setLoading(false); }
  };

  // --- LOGIQUE DE CHAT INTÉGRÉE (GÉNÉRATION + DISCUSSION) ---
  const askQuestion = async () => {
    if (!question.trim() && !attachedPdf) return;

    const userMsg = question.trim();
    setQuestion("");

    // CAS 1 : Si aucune leçon n'est chargée, on GÉNÈRE un cours
    if (!lesson) {
      setChatHistory(prev => [...prev, { role: "user", text: `Génère-moi un cours sur : ${userMsg} (Niveau ${level})` }]);
      setChatLoading(true);
      try {
        const res = await fetch(`${API}/generate-course`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: userMsg, level: level }),
        });
        const data = await res.json();
        await fetchLessons();
        await loadLesson(data.lesson_id);
        setChatHistory(prev => [...prev, { role: "ai", text: `C'est fait ! J'ai généré votre module sur **${userMsg}**. Vous pouvez maintenant me poser des questions spécifiques.`, isSystem: true }]);
      } catch {
        setChatHistory(prev => [...prev, { role: "ai", text: "Désolé, je n'ai pas pu générer ce cours. Vérifiez votre connexion." }]);
      } finally { setChatLoading(false); }
      return;
    }

    // CAS 2 : Si une leçon est chargée, on DISCUTE (RAG)
    setChatHistory(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lesson.id, question: userMsg, mode: chatMode }),
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: "ai", text: data.answer }]);
    } finally { setChatLoading(false); }
  };

  const exportPdf = () => {
    if (lesson) window.open(`${API}/lessons/${lesson.id}/pdf`, "_blank");
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* --- SIDEBAR GAUCHE (Bento Style) --- */}
      <aside className="w-72 bg-indigo-950 text-white flex flex-col shrink-0 shadow-2xl z-30">
        <div className="p-8 flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-xl shadow-lg shadow-indigo-500/40">
            <BrainCircuit size={28} />
          </div>
          <span className="font-black text-2xl tracking-tighter">LearnAI</span>
        </div>

        <div className="mx-6 mb-6 p-5 bg-indigo-900/50 rounded-3xl border border-indigo-800">
          <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase mb-3">
            <TrendingUp size={14} /> Niveau Maîtrise
          </div>
          <div className="text-3xl font-black mb-2">{stats.progress_percent}%</div>
          <div className="w-full bg-indigo-950 h-1.5 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${stats.progress_percent}%` }} className="bg-indigo-400 h-full" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Mes Modules</p>
          <div className="space-y-1">
            {lessonsList.map((l) => (
              <button key={l.id} onClick={() => loadLesson(l.id)}
                className={`w-full text-left p-3 rounded-xl text-sm transition-all flex items-center justify-between group ${lesson?.id === l.id ? 'bg-indigo-800 text-white' : 'text-indigo-300 hover:bg-indigo-900/50'}`}>
                <span className="truncate font-medium">{l.title}</span>
                <ChevronRight size={14} className={lesson?.id === l.id ? 'opacity-100' : 'opacity-0'} />
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-indigo-900">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="bg-indigo-800 p-2 rounded-lg text-indigo-300"><UserIcon size={18} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{userName}</p>
              <p className="text-[10px] text-indigo-500 font-bold uppercase">Étudiant SupMTI</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 p-3 text-sm text-indigo-400 hover:text-red-400 transition-colors font-bold justify-center">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* --- ZONE CENTRALE --- */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">

        {/* Header Minimaliste */}
        <header className="h-20 px-10 flex items-center justify-between border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wand2 className="text-indigo-600" size={20} />
            {lesson ? lesson.title : "Que souhaitez-vous apprendre ?"}
          </h2>
          {lesson && (
            <button onClick={exportPdf} className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">
              <FileDown size={16} /> PDF
            </button>
          )}
        </header>

        {/* Espace Lecture / Bienvenue */}
        <div className="flex-1 overflow-y-auto p-12 scroll-smooth">
          <AnimatePresence mode="wait">
            {!lesson ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col items-center justify-center text-center">
                <div className="bg-indigo-50 p-6 rounded-full mb-6">
                  <Sparkles size={48} className="text-indigo-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 mb-4">Apprenez n'importe quoi.</h1>
                <p className="text-slate-500 max-w-md mx-auto">Tapez un sujet dans le chat ci-dessous (ex: "Le protocole HTTP") pour que l'IA génère votre cours personnalisé.</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
                <article className="prose prose-slate lg:prose-xl mb-12">
                  <ReactMarkdown>{lesson.content}</ReactMarkdown>
                </article>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* --- CHAT INTÉGRÉ --- */}
        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <div className="max-w-3xl mx-auto">

            {/* Historique du chat miniature */}
            <div className="max-h-40 overflow-y-auto mb-4 space-y-3 pr-2 scrollbar-hide">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border text-slate-700 shadow-sm rounded-tl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && <div className="flex gap-1 p-2"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></span></div>}
              <div ref={chatEndRef} />
            </div>

            {/* Barre de saisie style "Claude" */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-2 focus-within:ring-2 ring-indigo-500/20 transition-all">
              <div className="flex items-center px-4 pt-2 gap-2">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setChatMode(m.id)} className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter transition-all ${chatMode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {m.label}
                  </button>
                ))}
                <div className="h-4 w-[1px] bg-slate-200 mx-2" />
                <select className="text-[10px] font-black bg-transparent outline-none uppercase" value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option>
                </select>
              </div>
              <div className="flex items-center gap-2 p-2">
                <textarea
                  rows={1}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askQuestion())}
                  placeholder={lesson ? "Posez une question sur le cours..." : "Entrez un sujet pour générer un cours..."}
                  className="flex-1 bg-transparent border-none outline-none p-3 text-sm resize-none"
                />
                <button onClick={askQuestion} disabled={chatLoading || !question.trim()} className="bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 transition-all disabled:opacity-30 shadow-lg shadow-indigo-100">
                  {chatLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
            <p className="text-[9px] text-center text-slate-400 mt-3 font-medium uppercase tracking-widest">Appuyez sur Entrée pour envoyer · LearnAI v1.0</p>
          </div>
        </div>
      </main>
    </div>
  );
}