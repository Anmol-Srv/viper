"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RESEND_SECONDS = 30;

// The auth service already returns lowercase, human sentences (see services/auth/server.js) —
// this only overrides the one case the spec calls out by name; everything else passes through
// as-is rather than a raw-JSON fallback.
function humanizeError(raw: string, fallback: string): string {
  if (!raw) return fallback;
  if (/invalid or expired otp/i.test(raw)) return "That code didn't match — try again or resend.";
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devHint, setDevHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async () => {
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}) as any);
    if (!res.ok || !data.ok) throw new Error(humanizeError(data.error, "Could not send code — try again."));
    if (data.devOtp) {
      setOtp(data.devOtp);
      setDevHint(`dev OTP: ${data.devOtp}`);
    } else {
      setOtp("");
      setDevHint("");
    }
  };

  const startLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendCode();
      setStep("otp");
      setResendCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code — try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      await sendCode();
      setResendCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code — try again.");
    } finally {
      setResending(false);
    }
  };

  const useDifferentEmail = () => {
    setStep("email");
    setOtp("");
    setDevHint("");
    setError("");
    setResendCooldown(0);
  };

  const verifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok || !data.ok) throw new Error(humanizeError(data.error, "That code didn't match — try again or resend."));
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match — try again or resend.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap" style={{ maxWidth: 380, paddingTop: 96 }}>
      <div className="brand">
        <div className="logo">V</div>
        <h1>Viper</h1>
      </div>
      <p className="sub">
        {step === "email" ? (
          "Sign in with your @airtribe.live email."
        ) : (
          <>
            Code sent to <strong style={{ color: "var(--text)" }}>{email}</strong>.
          </>
        )}
      </p>

      <div className="card">
        {step === "email" ? (
          <form onSubmit={startLogin}>
            <label>Work email</label>
            <input
              type="email"
              placeholder="you@airtribe.live"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && <div className="err">{error}</div>}
            <button className="primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <label>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
            />
            {devHint && <div className="sub" style={{ margin: "6px 0 0", fontSize: 12 }}>{devHint}</div>}
            {error && <div className="err">{error}</div>}
            <button className="primary" type="submit" disabled={busy || !otp.trim()}>
              {busy ? "Verifying…" : "Verify"}
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <button type="button" className="link-btn neutral" onClick={useDifferentEmail}>
                ← use a different email
              </button>
              <button
                type="button"
                className="link-btn neutral"
                disabled={resendCooldown > 0 || resending}
                onClick={resend}
              >
                {resending ? "resending…" : resendCooldown > 0 ? `resend in ${resendCooldown}s` : "resend code"}
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="foot">Viper is invite-only — a platform admin has to add you before you can sign in.</p>
    </div>
  );
}
