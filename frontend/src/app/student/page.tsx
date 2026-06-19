"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Loader2, ChevronRight, LogOut, User as UserIcon,
  TrendingUp, List, Footprints, Zap, Sparkles, BrainCircuit,
  Wand2, FileDown, MessageSquare
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type ChatMode = "normal" | "summary" | "step_by_step" | "quiz_express";

const MODES: { id: ChatMode; label: string; accent: string }[] = [
  { id: "normal", label: "Normal", accent: "bg-indigo-600" },
  { id: "summary", label: "Résumé", accent: "bg-emerald-600" },
  { id: "step_by_step", label: "Pas à pas", accent: "bg-amber-500" },
  { id: "quiz_express", label: "Quiz", accent: "bg-purple-600" },
];

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
      ...(options.headers || {}),
    },
  });
};

export default function Home() {
  const router = useRouter();

  const [level, setLevel] = useState("Débutant");
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<any>(null);
  const [lessonsList, setLessonsList] = useState<any[]>([]);
  const [userName, setUserName] = useState("");

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

  const [stats, setStats] = useState({
    theta: 0, progress_percent: 0, total_attempts: 0, success_rate: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setUserName(localStorage.getItem("userName") || "Étudiant");
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
    setLoading(true);
    setChatHistory([]);
    sessionIdRef.current = `${id}_${Date.now()}`;
    try {
      const res = await authFetch(`${API}/lessons/${id}`);
      if (res.ok) setLesson(await res.json());
    } finally { setLoading(false); }
  };

  const askQuestion = async () => {
    if (!question.trim()) return;
    const userMsg = question.trim();
    setQuestion("");

    if (!lesson) {
      setChatHistory(prev => [...prev, { role: "user", text: `Génère-moi un cours sur : ${userMsg} (Niveau ${level})` }]);
      setChatLoading(true);
      try {
        const res = await authFetch(`${API}/generate-course`, {
          method: "POST",
          body: JSON.stringify({ topic: userMsg, level }),
        });
        const data = await res.json();
        await fetchLessons();
        await loadLesson(data.lesson_id);
        setChatHistory(prev => [...prev, { role: "ai", text: `C'est fait ! Module sur **${userMsg}** généré. Posez vos questions !`, isSystem: true }]);
      } catch {
        setChatHistory(prev => [...prev, { role: "ai", text: "Désolé, erreur lors de la génération." }]);
      } finally { setChatLoading(false); }
      return;
    }

    setChatHistory(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await authFetch(`${API}/chat`, {
        method: "POST",
        body: JSON.stringify({
          lesson_id: lesson.id,
          question: userMsg,
          session_id: sessionIdRef.current,
          mode: chatMode,
        }),
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
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-indigo-300">
            <span>{stats.total_attempts} tentatives</span>
            <span>{stats.success_rate}% réussite</span>
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

      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
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

        <div className="flex-1 overflow-y-auto p-12 scroll-smooth">
          <AnimatePresence mode="wait">
            {!lesson ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col items-center justify-center text-center">
                <div className="bg-indigo-50 p-6 rounded-full mb-6">
                  <Sparkles size={48} className="text-indigo-600" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 mb-4">Apprenez n'importe quoi.</h1>
                <p className="text-slate-500 max-w-md mx-auto">Tapez un sujet dans le chat ci-dessous pour que l'IA génère votre cours personnalisé.</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
                {loading ? (
                  <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
                ) : (
                  <article className="prose prose-slate lg:prose-xl mb-12">
                    <ReactMarkdown>{lesson.content}</ReactMarkdown>
                  </article>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <div className="max-w-3xl mx-auto">
            <div className="max-h-40 overflow-y-auto mb-4 space-y-3 pr-2">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border text-slate-700 shadow-sm rounded-tl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-1 p-2">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-2 focus-within:ring-2 ring-indigo-500/20 transition-all">
              <div className="flex items-center px-4 pt-2 gap-2">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setChatMode(m.id)}
                    className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter transition-all ${chatMode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {m.label}
                  </button>
                ))}
                <div className="h-4 w-[1px] bg-slate-200 mx-2" />
                <select className="text-[10px] font-black bg-transparent outline-none uppercase" value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option>Débutant</option>
                  <option>Intermédiaire</option>
                  <option>Avancé</option>
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
                <button onClick={askQuestion} disabled={chatLoading || !question.trim()}
                  className="bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 transition-all disabled:opacity-30 shadow-lg shadow-indigo-100">
                  {chatLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
            <p className="text-[9px] text-center text-slate-400 mt-3 font-medium uppercase tracking-widest">
              Appuyez sur Entrée pour envoyer · LearnAI v1.0
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}