"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devHint, setDevHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const startLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not send code");
      if (data.devOtp) {
        setOtp(data.devOtp);
        setDevHint(`dev OTP: ${data.devOtp}`);
      }
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
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
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Invalid code");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
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
        {step === "email" ? "Sign in with your @airtribe.live email." : `Enter the code sent to ${email}.`}
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
            <button className="primary" type="submit" disabled={busy}>
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
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}
      </div>

      <p className="foot">Viper is invite-only — a platform admin has to add you before you can sign in.</p>
    </div>
  );
}
