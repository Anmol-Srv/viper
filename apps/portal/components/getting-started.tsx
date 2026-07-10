"use client";
// Shared onboarding content (SPEC §2.1/2.2) — rendered both on the post-create panel
// (app/page.tsx) and the project detail page's Getting Started tab, so it's not a
// one-time-only chance to see it.
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function GettingStarted({ name, subdomain, liveUrl }: { name: string; subdomain: string; liveUrl: string }) {
  const setupCmd = `cd ~/Downloads && unzip ${subdomain}.zip -d ${subdomain} && cd ${subdomain} && npm install && npm run dev`;
  const starterPrompt = `You're working in a Viper scaffold. Read CLAUDE.md and docs/building.md first and follow The Rules exactly. Then help me build: <describe your dashboard for "${name}">.`;

  return (
    <div className="getting-started">
      <div className="gs-step">
        <div className="gs-num">1</div>
        <div>
          <p>
            You need <strong>Node 20+</strong>. Check with <code>node --version</code> — if that fails or shows
            an older version, install from{" "}
            <a href="https://nodejs.org" target="_blank" rel="noreferrer">
              nodejs.org
            </a>
            .
          </p>
        </div>
      </div>

      <div className="gs-step">
        <div className="gs-num">2</div>
        <div>
          <p>Unzip and start it locally (no login wall — dev bypass is on):</p>
          <div className="gs-code">
            <code>{setupCmd}</code>
            <CopyButton text={setupCmd} />
          </div>
        </div>
      </div>

      <div className="gs-step">
        <div className="gs-num">3</div>
        <div>
          <p>Hand this to your AI agent to get started:</p>
          <div className="gs-code">
            <code>{starterPrompt}</code>
            <CopyButton text={starterPrompt} />
          </div>
        </div>
      </div>

      <div className="gs-step">
        <div className="gs-num">4</div>
        <div>
          <p>
            When you're ready: <code>npm run deploy</code> — your app goes live at{" "}
            <a href={liveUrl} target="_blank" rel="noreferrer">
              {liveUrl}
            </a>
            . Teammates you invite can log in with their @airtribe.live email.
          </p>
        </div>
      </div>
    </div>
  );
}
