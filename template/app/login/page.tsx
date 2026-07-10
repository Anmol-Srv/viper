'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
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

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
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
