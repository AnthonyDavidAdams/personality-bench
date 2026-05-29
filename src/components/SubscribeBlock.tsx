"use client";
import { useState } from "react";

export function SubscribeBlock() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "home_page" }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setMessage(data.message || "Subscribed.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Could not subscribe.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-neutral-700 leading-relaxed">
        Get an email when new frontier models are added, when new instruments land, or when we publish
        major findings. Roughly one email per month. No spam, instant unsubscribe.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm focus:outline-none focus:border-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {status === "loading" ? "…" : "Subscribe"}
        </button>
      </div>
      {message ? (
        <p className={"text-xs " + (status === "success" ? "text-[var(--positive)]" : "text-[var(--warning)]")}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
