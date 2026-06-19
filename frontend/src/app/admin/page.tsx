"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap, Users, BookOpen, LayoutDashboard, LogOut,
  RefreshCw, Trash2, Pencil, X, Save, Loader2, Plus,
  ChevronRight, ArrowLeft, AlertOctagon, Shield, TrendingUp,
  ArrowUpDown, Target
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
};

const roleColor = (role: string) => role === "ADMIN" ? "#534AB7" : role === "TEACHER" ? "#185FA5" : "#0F6E56";
const roleLabel = (role: string) => role === "ADMIN" ? "Admin" : role === "TEACHER" ? "Enseignant" : "Étudiant";
const thetaColor = (t: number) => t > 1 ? "#10b981" : t > 0 ? "#6366f1" : t > -1 ? "#f59e0b" : "#ef4444";
const thetaLabel = (t: number) => t > 1 ? "Expert" : t > 0 ? "Avancé" : t > -1 ? "Intermédiaire" : "Débutant";
const thetaPercent = (t: number) => Math.max(0, Math.min(100, Math.round(((t + 3) / 6) * 100)));

const NAV = [
  { id: "overview", label: "Vue d'ensemble", Icon: LayoutDashboard },
  { id: "users",    label: "Utilisateurs",   Icon: Users },
  { id: "lessons",  label: "Cours",          Icon: BookOpen },
];

interface AppUser {
  id: string; name: string; email: string; role: string;
  theta: number; progress_percent: number; total_attempts: number;
  success_rate: number; created_at: string | null;
}

interface Lesson {
  id: string; title: string; difficulty_level: string; total_attempts: number;
}

interface UserDetail extends AppUser {
  attempts: { id: string; question_text: string; lesson_title: string; is_correct: boolean; timestamp: string | null }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [userName, setUserName]   = useState("");
  const [activeNav, setActiveNav] = useState("overview");
  const [stats, setStats]         = useState<any>(null);
  const [users, setUsers]         = useState<AppUser[]>([]);
  const [lessons, setLessons]     = useState<Lesson[]>([]);
  const [loading, setLoading]     = useState(true);

  const [selectedUser, setSelectedUser]     = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading]   = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [editForm, setEditForm]             = useState({ full_name: "", email: "", ability_theta: "", role: "" });
  const [saving, setSaving]                 = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState<AppUser | Lesson | null>(null);
  const [deleteType, setDeleteType]         = useState<"user" | "lesson">("user");
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [showCreate, setShowCreate]         = useState(false);
  const [createForm, setCreateForm]         = useState({ full_name: "", email: "", password: "", role: "STUDENT" });
  const [creating, setCreating]             = useState(false);
  const [sortRole, setSortRole]             = useState<string>("ALL");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    const role = localStorage.getItem("userRole");
    if (role !== "ADMIN") { router.push("/student"); return; }
    setUserName(localStorage.getItem("userName") || "Admin");
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, u, l] = await Promise.all([
        authFetch(`${API}/admin/stats`).then(r => r.json()),
        authFetch(`${API}/admin/users`).then(r => r.json()),
        authFetch(`${API}/admin/lessons`).then(r => r.json()),
      ]);
      setStats(s);
      setUsers(Array.isArray(u) ? u : []);
      setLessons(Array.isArray(l) ? l : []);
    } catch { setUsers([]); setLessons([]); }
    finally { setLoading(false); }
  };

  const openUserDetail = async (id: string) => {
    setDetailLoading(true); setSelectedUser(null);
    try {
      const res = await authFetch(`${API}/admin/users/${id}`);
      if (res.ok) setSelectedUser(await res.json());
    } finally { setDetailLoading(false); }
  };

  const startEdit = (u: AppUser) => {
    setEditingId(u.id);
    setEditForm({ full_name: u.name, email: u.email, ability_theta: String(u.theta), role: u.role });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await authFetch(`${API}/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: editForm.full_name, email: editForm.email, ability_theta: parseFloat(editForm.ability_theta), role: editForm.role }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUsers(prev => prev.map(u => u.id === id ? { ...u, name: updated.name, email: updated.email, role: updated.role, theta: updated.theta, progress_percent: thetaPercent(updated.theta) } : u));
        setEditingId(null);
      } else { const err = await res.json(); alert(err.detail || "Erreur"); }
    } finally { setSaving(false); }
  };

  const createUser = async () => {
    setCreating(true);
    try {
      const res = await authFetch(`${API}/admin/users`, { method: "POST", body: JSON.stringify(createForm) });
      if (res.ok) { await fetchAll(); setShowCreate(false); setCreateForm({ full_name: "", email: "", password: "", role: "STUDENT" }); }
      else { const err = await res.json(); alert(err.detail || "Erreur"); }
    } finally { setCreating(false); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeletingId(deleteConfirm.id);
    try {
      const url = deleteType === "user" ? `${API}/admin/users/${deleteConfirm.id}` : `${API}/admin/lessons/${deleteConfirm.id}`;
      const res = await authFetch(url, { method: "DELETE" });
      if (res.ok) {
        if (deleteType === "user") { setUsers(prev => prev.filter(u => u.id !== deleteConfirm.id)); if (selectedUser?.id === deleteConfirm.id) setSelectedUser(null); }
        else { setLessons(prev => prev.filter(l => l.id !== deleteConfirm.id)); }
        setDeleteConfirm(null);
      }
    } finally { setDeletingId(null); }
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };

  const filteredUsers = sortRole === "ALL" ? users : users.filter(u => u.role === sortRole);
  const userInitials = userName.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">

      {/* SIDEBAR */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col sticky top-0 h-screen shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
            <Shield size={15} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">LearnAI</p>
            <p className="text-[10px] text-purple-500 leading-tight font-bold">Espace Admin</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-black shrink-0">
            {userInitials || "AD"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
            <p className="text-[10px] text-purple-500 font-bold">Administrateur</p>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setActiveNav(id); setSelectedUser(null); }}
              className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors text-left border-l-2
                ${activeNav === id ? "text-purple-600 bg-purple-50 border-purple-500 font-bold" : "text-slate-500 border-transparent hover:bg-slate-50 font-medium"}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-100">
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">{NAV.find(n => n.id === activeNav)?.label}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Tableau de bord administrateur</p>
          </div>
          <button onClick={fetchAll} className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-100">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ===== OVERVIEW ===== */}
            {activeNav === "overview" && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Étudiants",    value: stats.total_students, color: "#0F6E56" },
                    { label: "Enseignants",  value: stats.total_teachers, color: "#185FA5" },
                    { label: "Cours",        value: stats.total_lessons,  color: "#534AB7" },
                    { label: "Tentatives",   value: stats.total_attempts, color: "#854F0B" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
                      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-100 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Niveau moyen étudiants</p>
                    <p className="text-2xl font-black" style={{ color: thetaColor(stats.average_theta) }}>
                      {thetaLabel(stats.average_theta)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">θ = {stats.average_theta}</p>
                    <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${thetaPercent(stats.average_theta)}%`, backgroundColor: thetaColor(stats.average_theta) }} />
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Cours les plus utilisés</p>
                    <div className="space-y-2">
                      {(stats.popular_lessons ?? []).slice(0, 4).map((l: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-600 truncate flex-1">{l.title}</span>
                          <span className="font-black text-purple-600 ml-2">{l.attempts}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== USERS ===== */}
            {activeNav === "users" && !selectedUser && (
              <div className="space-y-4">
                {/* Créer un utilisateur */}
                {showCreate ? (
                  <div className="bg-white rounded-2xl border border-purple-200 p-6">
                    <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2"><Plus size={15} /> Nouvel utilisateur</h3>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <input placeholder="Nom complet" value={createForm.full_name}
                        onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 ring-purple-400" />
                      <input placeholder="Email" type="email" value={createForm.email}
                        onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 ring-purple-400" />
                      <input placeholder="Mot de passe" type="password" value={createForm.password}
                        onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 ring-purple-400" />
                      <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 ring-purple-400">
                        <option value="STUDENT">Étudiant</option>
                        <option value="TEACHER">Enseignant</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={createUser} disabled={creating}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50">
                        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer
                      </button>
                      <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700">
                    <Plus size={14} /> Nouvel utilisateur
                  </button>
                )}

                <div className="bg-white rounded-2xl border border-slate-100 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <Users size={16} className="text-slate-400" /> Utilisateurs ({users.length})
                    </h2>
                    <div className="flex gap-1">
                      {["ALL", "STUDENT", "TEACHER", "ADMIN"].map(r => (
                        <button key={r} onClick={() => setSortRole(r)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors ${sortRole === r ? "bg-purple-100 text-purple-700" : "text-slate-400 hover:bg-slate-100"}`}>
                          {r === "ALL" ? "Tous" : roleLabel(r)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {filteredUsers.map((u, i) => (
                      <div key={u.id} className="rounded-xl hover:bg-slate-50 transition-colors">
                        {editingId === u.id ? (
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                              placeholder="Nom" className="flex-1 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 ring-purple-400" />
                            <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                              placeholder="Email" className="flex-1 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 ring-purple-400" />
                            <input type="number" step="0.1" value={editForm.ability_theta} onChange={e => setEditForm({ ...editForm, ability_theta: e.target.value })}
                              placeholder="θ" className="w-16 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 ring-purple-400" />
                            <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                              className="bg-purple-50 border border-purple-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 ring-purple-400">
                              <option value="STUDENT">Étudiant</option>
                              <option value="TEACHER">Enseignant</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <button onClick={() => saveEdit(u.id)} disabled={saving}
                              className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0"
                              style={{ backgroundColor: roleColor(u.role) }}>
                              {i + 1}
                            </div>
                            <button onClick={() => openUserDetail(u.id)} className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-bold text-slate-800 truncate">{u.name}</p>
                              <p className="text-xs text-slate-400 truncate">{u.email}</p>
                            </button>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                              style={{ color: roleColor(u.role), backgroundColor: roleColor(u.role) + "18" }}>
                              {roleLabel(u.role)}
                            </span>
                            {u.role === "STUDENT" && (
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black" style={{ color: thetaColor(u.theta) }}>{thetaLabel(u.theta)}</p>
                                <p className="text-[10px] text-slate-400">θ = {u.theta}</p>
                              </div>
                            )}
                            <div className="flex gap-1.5 shrink-0">
                              <button onClick={() => openUserDetail(u.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200">
                                <ChevronRight size={14} />
                              </button>
                              <button onClick={() => startEdit(u)} className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => { setDeleteConfirm(u); setDeleteType("user"); }}
                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===== USER DETAIL ===== */}
            {activeNav === "users" && selectedUser && (
              <div className="space-y-6">
                <button onClick={() => setSelectedUser(null)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-purple-600">
                  <ArrowLeft size={16} /> Retour à la liste
                </button>
                {detailLoading ? (
                  <div className="flex justify-center p-20"><Loader2 className="animate-spin text-purple-600" size={32} /></div>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl border border-slate-100 p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-xl font-black text-slate-900">{selectedUser.name}</h2>
                          <p className="text-slate-400 text-sm">{selectedUser.email}</p>
                        </div>
                        <span className="text-xs font-black uppercase px-3 py-1.5 rounded-full"
                          style={{ color: roleColor(selectedUser.role), backgroundColor: roleColor(selectedUser.role) + "18" }}>
                          {roleLabel(selectedUser.role)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Progression</p>
                          <p className="text-2xl font-black text-slate-900">{selectedUser.progress_percent}%</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Tentatives</p>
                          <p className="text-2xl font-black text-slate-900">{selectedUser.total_attempts}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1"><Target size={10} /> Réussite</p>
                          <p className="text-2xl font-black text-slate-900">{selectedUser.success_rate}%</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="p-6 border-b border-slate-100">
                        <h3 className="font-black text-sm text-slate-800">Historique des tentatives</h3>
                      </div>
                      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                        {selectedUser.attempts.length === 0 && (
                          <p className="p-6 text-center text-slate-400 text-sm">Aucune tentative.</p>
                        )}
                        {selectedUser.attempts.map(a => (
                          <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate">{a.question_text}</p>
                              <p className="text-xs text-slate-400">{a.lesson_title}</p>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${a.is_correct ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                              {a.is_correct ? "Correct" : "Incorrect"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== LESSONS ===== */}
            {activeNav === "lessons" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="text-sm font-black text-slate-800 mb-5 flex items-center gap-2">
                  <BookOpen size={16} className="text-slate-400" /> Cours ({lessons.length})
                </h2>
                {lessons.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">Aucun cours.</p>
                ) : (
                  <div className="space-y-1">
                    {lessons.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{l.title}</p>
                          <p className="text-xs text-slate-400">{l.difficulty_level} · {l.total_attempts} tentatives</p>
                        </div>
                        <button onClick={() => { setDeleteConfirm(l as any); setDeleteType("lesson"); }}
                          className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL SUPPRESSION */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <div className="bg-red-50 p-2 rounded-xl"><AlertOctagon size={20} /></div>
              <h3 className="font-black text-sm text-slate-800">
                Supprimer {deleteType === "user" ? "l'utilisateur" : "le cours"}
              </h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Supprimer <span className="font-bold">{(deleteConfirm as any).name || (deleteConfirm as any).title}</span> ?
              {deleteType === "user" ? " Toutes ses tentatives seront supprimées." : " Toutes les questions et tentatives associées seront supprimées."} Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 p-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
                Annuler
              </button>
              <button onClick={confirmDelete} disabled={!!deletingId}
                className="flex-1 p-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}