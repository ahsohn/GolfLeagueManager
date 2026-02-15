'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background with gradient and pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-masters-green via-masters-fairway to-masters-putting" />

      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-gold blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Golf course pattern overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-slide-up">
        <div className="card card-elevated bg-white/95 backdrop-blur-sm p-10">
          {/* Logo/Title area */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-6 shadow-golf-lg">
              <span className="text-4xl">⛳</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-charcoal mb-2">
              Fantasy Golf League
            </h1>
            <p className="text-charcoal-light/60 text-sm">
              Enter the clubhouse
            </p>
          </div>

          {/* Decorative line */}
          <div className="flex items-center mb-8">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cream-dark to-transparent" />
            <span className="px-4 text-gold text-lg">●</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cream-dark to-transparent" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-charcoal-light mb-2 tracking-wide uppercase">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input text-lg"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <span className="text-red-500">⚠</span>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full text-lg py-4"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entering...
                </span>
              ) : (
                'Enter the League'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-charcoal-light/50 uppercase tracking-wider">
              FedEx Cup Points Tracker
            </p>
          </div>
        </div>

        {/* Bottom decorative element */}
        <div className="text-center mt-6">
          <span className="text-white/40 text-sm font-display italic">
            &ldquo;The most important shot in golf is the next one.&rdquo;
          </span>
        </div>
      </div>
    </div>
  );
}
