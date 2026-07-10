'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import viperConfig from '@/viper.json';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only ever an in-app path — never redirect off-origin with a user-supplied value.
  const rawNext = searchParams.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devHint, setDevHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const startLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send code');

      if (data.devOtp) {
        setOtp(data.devOtp);
        setDevHint(`dev OTP: ${data.devOtp}`);
      }
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invalid code');

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex flex-col items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded bg-white text-sm font-bold text-black">
          {(viperConfig.name || 'V').charAt(0).toUpperCase()}
        </span>
        <span className="text-sm font-medium text-muted">{viperConfig.name}</span>
      </div>

      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Sign in</h1>
        <p className="mb-6 text-sm text-muted">
          {step === 'email' ? 'Use your @airtribe.live email.' : `Enter the code sent to ${email}.`}
        </p>

        {step === 'email' ? (
          <form onSubmit={startLogin} className="flex flex-col gap-3">
            <Input
              type="email"
              placeholder="you@airtribe.live"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={loading}>
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="flex flex-col gap-3">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            {devHint && <p className="text-xs text-muted">{devHint}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={loading}>
              Verify
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
