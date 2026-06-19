"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap, Users, BarChart3, AlertTriangle, TrendingUp,
  LayoutDashboard, LogOut, RefreshCw, ArrowUpDown, CheckCircle,
  Activity, Pencil, Trash2, X, Save, Loader2, ChevronRight,
  ArrowLeft, Target, AlertOctagon
} from "lucide-react";

import { API, authFetch } from "@/lib/api";

const thetaLabel = (t: number) =>
  t > 1 ? "Expert" : t > 0 ? "Avancé" : t > -1 ? "Intermédiaire" : "Débutant";
const thetaColor = (t: number) =>
  t > 1 ? "#10b981" : t > 0 ? "#6366f1" : t > -1 ? "#f59e0b" : "#ef4444";
const thetaPercent = (t: number) =>
  Math.max(0, Math.min(100, Math.round(((t + 3) / 6) * 100)));

const NAV = [
  { id: "overview", label: "Vue d'ensemble", Icon: LayoutDashboard },
  { id: "students", label: "Étudiants", Icon: Users },
  { id: "heatmap", label: "Questions", Icon: BarChart3 },
  { id: "reco", label: "Recommandations", Icon: AlertTriangle },
  { id: "progression", label: "Progression", Icon: TrendingUp },
];

interface Student {
  id: string;
  name: string;
  email: string;
  theta: number;
  progress_percent: number;
  total_attempts: number;
  success_rate: number;
}

interface Attempt {
  id: string;
  question_text: string;
  lesson_title: string;
  is_correct: boolean;
  timestamp: string | null;
}

interface StudentDetail extends Student {
  attempts: Attempt[];
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [progression, setProgression] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortAsc, setSortAsc] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");

  // --- CRUD étudiant ---
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", ability_theta: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    const role = localStorage.getItem("userRole");
    if (role !== "TEACHER" && role !== "ADMIN") { router.push("/student"); return; }
    setUserName(localStorage.getItem("userName") || "Enseignant");
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, st, h, r, p] = await Promise.all([
        authFetch(`${API}/teacher/stats`).then(r => r.json()),
        authFetch(`${API}/teacher/students`).then(r => r.json()),
        authFetch(`${API}/teacher/heatmap`).then(r => r.json()),
        authFetch(`${API}/teacher/recommendations`).then(r => r.json()),
        authFetch(`${API}/teacher/progression`).then(r => r.json()),
      ]);
      setStats(s ?? null);
      setStudents(Array.isArray(st) ? st : st?.students ?? []);
      setHeatmap(Array.isArray(h) ? h : h?.questions ?? []);
      setRecommendations(Array.isArray(r) ? r : r?.recommendations ?? []);
      setProgression(Array.isArray(p) ? p : p?.progression ?? []);
    } catch {
      setStudents([]); setHeatmap([]); setRecommendations([]); setProgression([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  const sortedStudents = [...students].sort((a, b) =>
    sortAsc ? (a.theta ?? 0) - (b.theta ?? 0) : (b.theta ?? 0) - (a.theta ?? 0)
  );
  const maxAttempts = progression.length > 0
    ? Math.max(...progression.map(p => p.attempts ?? 0), 1)
    : 1;

  const userInitials = userName
    .split(" ").slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  const avgTheta: number = typeof stats?.average_theta === "number" ? stats.average_theta : 0;

  const currentLabel = NAV.find(n => n.id === activeNav)?.label ?? "";

  // --- CRUD handlers ---
  const openStudentDetail = async (id: string) => {
    setDetailLoading(true);
    setSelectedStudent(null);
    try {
      const res = await authFetch(`${API}/teacher/students/${id}`);
      if (res.ok) setSelectedStudent(await res.json());
    } finally { setDetailLoading(false); }
  };

  const startEdit = (s: Student) => {
    setEditingId(s.id);
    setEditForm({ full_name: s.name, email: s.email, ability_theta: String(s.theta) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ full_name: "", email: "", ability_theta: "" });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await authFetch(`${API}/teacher/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: editForm.full_name,
          email: editForm.email,
          ability_theta: parseFloat(editForm.ability_theta),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setStudents(prev => prev.map(s => s.id === id
          ? { ...s, name: updated.name, email: updated.email, theta: updated.theta, progress_percent: thetaPercent(updated.theta) }
          : s));
        if (selectedStudent?.id === id) await openStudentDetail(id);
        cancelEdit();
      } else {
        const err = await res.json();
        alert(err.detail || "Erreur lors de la mise à jour");
      }
    } finally { setSaving(false); }
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await authFetch(`${API}/teacher/students/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStudents(prev => prev.filter(s => s.id !== id));
        if (selectedStudent?.id === id) setSelectedStudent(null);
        setDeleteConfirm(null);
      }
    } finally { setDeletingId(null); }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">

      {/* SIDEBAR */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
            <GraduationCap size={15} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">LearnAI</p>
            <p className="text-[10px] text-slate-400 leading-tight">Espace enseignant</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-black shrink-0">
            {userInitials || "ME"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
            <p className="text-[10px] text-slate-400">Professeur</p>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveNav(id); setSelectedStudent(null); }}
              className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors text-left border-l-2
                ${activeNav === id
                  ? "text-indigo-600 bg-indigo-50 border-indigo-500 font-bold"
                  : "text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700 font-medium"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto px-8 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">{currentLabel}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Tableau de bord enseignant</p>
          </div>
          <button
            onClick={fetchAll}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ===== OVERVIEW ===== */}
            {activeNav === "overview" && (
              <div className="space-y-6">
                {stats && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-100 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Étudiants</p>
                      <p className="text-3xl font-black text-slate-900">{stats.total_students ?? 0}</p>
                      <p className="text-xs text-slate-400 mt-1">inscrits sur la plateforme</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Niveau moyen</p>
                      <p className="text-3xl font-black" style={{ color: thetaColor(avgTheta) }}>
                        {thetaLabel(avgTheta)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">θ = {avgTheta.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Progression globale</p>
                      <p className="text-3xl font-black text-slate-900">{thetaPercent(avgTheta)}%</p>
                      <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${thetaPercent(avgTheta)}%`, backgroundColor: thetaColor(avgTheta) }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick summary cards linking to other pages */}
                <div className="grid grid-cols-3 gap-4">
                  <button onClick={() => setActiveNav("students")} className="bg-white rounded-2xl border border-slate-100 p-5 text-left hover:border-indigo-200 transition-colors">
                    <Users size={18} className="text-indigo-500 mb-2" />
                    <p className="text-sm font-black text-slate-800">{students.length} étudiants</p>
                    <p className="text-xs text-slate-400 mt-1">Voir la liste détaillée</p>
                  </button>
                  <button onClick={() => setActiveNav("heatmap")} className="bg-white rounded-2xl border border-slate-100 p-5 text-left hover:border-indigo-200 transition-colors">
                    <BarChart3 size={18} className="text-red-400 mb-2" />
                    <p className="text-sm font-black text-slate-800">{heatmap.length} questions analysées</p>
                    <p className="text-xs text-slate-400 mt-1">Voir la heatmap</p>
                  </button>
                  <button onClick={() => setActiveNav("reco")} className="bg-white rounded-2xl border border-slate-100 p-5 text-left hover:border-indigo-200 transition-colors">
                    <AlertTriangle size={18} className="text-amber-400 mb-2" />
                    <p className="text-sm font-black text-slate-800">{recommendations.length} recommandations</p>
                    <p className="text-xs text-slate-400 mt-1">Voir les alertes</p>
                  </button>
                </div>
              </div>
            )}

            {/* ===== STUDENTS (CRUD) ===== */}
            {activeNav === "students" && !selectedStudent && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <Users size={16} className="text-slate-400" />
                    Étudiants ({students.length})
                  </h2>
                  <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <ArrowUpDown size={13} />
                    Trier par θ
                  </button>
                </div>
                {students.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">Aucun étudiant inscrit.</p>
                ) : (
                  <div className="space-y-1">
                    {sortedStudents.map((s, i) => (
                      <div key={s.id ?? i} className="rounded-xl hover:bg-slate-50 transition-colors">
                        {editingId === s.id ? (
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <input
                              value={editForm.full_name}
                              onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                              placeholder="Nom"
                              className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-sm font-bold outline-none focus:ring-2 ring-indigo-500 text-slate-900"
                            />
                            <input
                              value={editForm.email}
                              onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                              placeholder="Email"
                              className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 ring-indigo-500 text-slate-900"
                            />
                            <input
                              type="number" step="0.1"
                              value={editForm.ability_theta}
                              onChange={e => setEditForm({ ...editForm, ability_theta: e.target.value })}
                              placeholder="θ"
                              className="w-20 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 ring-indigo-500 text-slate-900"
                            />
                            <button onClick={() => saveEdit(s.id)} disabled={saving}
                              className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50 shrink-0">
                              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>
                            <button onClick={cancelEdit}
                              className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0"
                              style={{ backgroundColor: thetaColor(s.theta ?? 0) }}
                            >
                              {i + 1}
                            </div>
                            <button onClick={() => openStudentDetail(s.id)} className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-bold text-slate-800 truncate">{s.name ?? "—"}</p>
                              <p className="text-xs text-slate-400 truncate">{s.email ?? ""}</p>
                            </button>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-black uppercase" style={{ color: thetaColor(s.theta ?? 0) }}>
                                {thetaLabel(s.theta ?? 0)}
                              </p>
                              <p className="text-[10px] text-slate-400">θ = {(s.theta ?? 0).toFixed(2)}</p>
                            </div>
                            <div className="w-28 shrink-0">
                              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                <span>{s.success_rate ?? 0}%</span>
                                <span>{s.total_attempts ?? 0} Q</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${s.progress_percent ?? 0}%`, backgroundColor: thetaColor(s.theta ?? 0) }}
                                />
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button onClick={() => openStudentDetail(s.id)}
                                className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors">
                                <ChevronRight size={14} />
                              </button>
                              <button onClick={() => startEdit(s)}
                                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => setDeleteConfirm(s)}
                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== STUDENT DETAIL ===== */}
            {activeNav === "students" && selectedStudent && (
              <div className="space-y-6">
                <button onClick={() => setSelectedStudent(null)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600">
                  <ArrowLeft size={16} /> Retour à la liste
                </button>

                {detailLoading ? (
                  <div className="flex justify-center p-20">
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl border border-slate-100 p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-xl font-black text-slate-900">{selectedStudent.name}</h2>
                          <p className="text-slate-400 text-sm">{selectedStudent.email}</p>
                        </div>
                        <span className="text-xs font-black uppercase px-3 py-1.5 rounded-full"
                          style={{ color: thetaColor(selectedStudent.theta), backgroundColor: `${thetaColor(selectedStudent.theta)}1A` }}>
                          {thetaLabel(selectedStudent.theta)} (θ = {selectedStudent.theta})
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Progression</p>
                          <p className="text-2xl font-black text-slate-900">{selectedStudent.progress_percent}%</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Tentatives</p>
                          <p className="text-2xl font-black text-slate-900">{selectedStudent.total_attempts}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Target size={10} /> Réussite
                          </p>
                          <p className="text-2xl font-black text-slate-900">{selectedStudent.success_rate}%</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="p-6 border-b border-slate-100">
                        <h3 className="font-black text-sm text-slate-800">Historique des tentatives</h3>
                      </div>
                      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                        {selectedStudent.attempts.length === 0 && (
                          <p className="p-6 text-center text-slate-400 text-sm">Aucune tentative.</p>
                        )}
                        {selectedStudent.attempts.map(a => (
                          <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate">{a.question_text}</p>
                              <p className="text-xs text-slate-400">{a.lesson_title}</p>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${a.is_correct ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                              {a.is_correct ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== HEATMAP ===== */}
            {activeNav === "heatmap" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-5">
                  <BarChart3 size={16} className="text-slate-400" />
                  Questions les plus difficiles ({heatmap.length})
                </h2>
                {heatmap.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">Aucune tentative enregistrée.</p>
                ) : (
                  <div className="space-y-4">
                    {heatmap.map((q, i) => {
                      const fr = q.failure_rate ?? 0;
                      const color = fr > 60 ? "#ef4444" : fr > 35 ? "#f59e0b" : "#10b981";
                      return (
                        <div key={q.question_id ?? i} className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{q.question_text ?? "—"}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{q.lesson_title ?? ""} · b={q.difficulty_b ?? 0}</p>
                            <div className="mt-1.5 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${fr}%`, backgroundColor: color }} />
                            </div>
                          </div>
                          <div className="text-right shrink-0 w-16">
                            <p className="text-base font-black" style={{ color }}>{fr}%</p>
                            <p className="text-[10px] text-slate-400">{q.total_attempts ?? 0} essais</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== RECOMMANDATIONS ===== */}
            {activeNav === "reco" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-5">
                  <AlertTriangle size={16} className="text-slate-400" />
                  Recommandations ({recommendations.length})
                </h2>
                {recommendations.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle size={40} className="mx-auto text-emerald-400 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">Aucune alerte. Tout va bien.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map((r, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-sm font-bold text-slate-800">{r.lesson_title ?? "—"}</p>
                        <p className="text-xs text-slate-500 mt-1">{r.recommendation ?? ""}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-red-400" style={{ width: `${r.failure_rate ?? 0}%` }} />
                          </div>
                          <span className="text-xs font-black text-red-400 shrink-0">{r.failure_rate ?? 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== PROGRESSION ===== */}
            {activeNav === "progression" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-5">
                  <Activity size={16} className="text-slate-400" />
                  Progression (14 jours)
                </h2>
                {progression.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Activity size={40} className="mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-medium">Pas encore de données.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-1.5 h-48 mb-2">
                      {progression.map((p, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          <div className="absolute -top-7 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                            θ={p.avg_theta} · {p.attempts}Q
                          </div>
                          <div
                            className="w-full rounded-t transition-all duration-500"
                            style={{
                              height: `${Math.max(6, ((p.attempts ?? 0) / maxAttempts) * 100)}%`,
                              backgroundColor: thetaColor(p.avg_theta ?? 0),
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      {progression.map((p, i) => (
                        <div key={i} className="flex-1 text-center">
                          <p className="text-[10px] text-slate-400 truncate">
                            {new Date(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm text-slate-500">
                      <span>Début : θ = {progression[0]?.avg_theta ?? 0}</span>
                      <span>Maintenant : θ = {progression[progression.length - 1]?.avg_theta ?? 0}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL CONFIRMATION SUPPRESSION */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <div className="bg-red-50 p-2 rounded-xl"><AlertOctagon size={20} /></div>
              <h3 className="font-black text-sm text-slate-800">Supprimer l'étudiant</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Es-tu sûr de vouloir supprimer <span className="font-bold">{deleteConfirm.name}</span> ?
              Toutes ses tentatives seront également supprimées. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 p-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                Annuler
              </button>
              <button onClick={() => confirmDelete(deleteConfirm.id)} disabled={deletingId === deleteConfirm.id}
                className="flex-1 p-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingId === deleteConfirm.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}