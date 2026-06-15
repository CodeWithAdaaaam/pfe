"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Identifiants invalides");

      const data = await res.json();
      // SAUVEGARDE DU TOKEN ET DES INFOS
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("userName", data.user.name);
      localStorage.setItem("userRole", data.user.role);
      if (data.user.role === "TEACHER" || data.user.role === "ADMIN") {
        router.push("/teacher");
      } else {
        router.push("/");
      }
      
      router.push("/"); // Redirection vers le dashboard
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-indigo-100 p-3 rounded-2xl mb-4 text-indigo-600">
            <GraduationCap size={40} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Bienvenue</h1>
          <p className="text-slate-500 text-sm mt-2">Connectez-vous à votre espace LearnAI</p>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-6 text-center">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Email</label>
            <input type="email" required className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 text-slate-900"
              placeholder="adam@supmti.ma" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Mot de passe</label>
            <input type="password" required className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 text-slate-900"
              placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Se connecter"}
          </button>
        </form>
        
        <p className="text-center mt-8 text-sm text-slate-500">
  Pas encore de compte ?{" "}
  <button onClick={() => router.push("/signup")} className="text-indigo-600 font-bold hover:underline">
    Inscrivez-vous
  </button>
</p>
      </div>
    </div>
  );
}