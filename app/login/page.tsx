"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    router.push("/products");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#16283A]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-9">
        <div className="text-center mb-7">
          <h1 className="font-serif text-3xl text-[#3E86C6] tracking-wide">
            JeniDiam
          </h1>
          <p className="text-[11px] tracking-[3px] text-gray-400 uppercase mt-1">
            Product Vault
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#3E86C6] focus:ring-1 focus:ring-[#3E86C6]"
              placeholder="you@jenidiam.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#3E86C6] focus:ring-1 focus:ring-[#3E86C6]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#3E86C6] hover:bg-[#2f6fa8] text-white font-semibold rounded-lg text-sm transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          No public registration. Access by invite only.
        </p>
      </div>
    </div>
  );
}