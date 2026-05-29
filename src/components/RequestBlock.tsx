"use client";
import { useState } from "react";

export function RequestBlock() {
  const [type, setType] = useState<"model" | "instrument" | "other">("model");
  const [target, setTarget] = useState("");
  const [rationale, setRationale] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target, rationale, email }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setMessage(data.message || "Logged — thanks.");
        setTarget("");
        setRationale("");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Could not submit.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — please try again.");
    }
  }

  const placeholder = type === "model"
    ? "anthropic/claude-opus-5 or x-ai/grok-5"
    : type === "instrument"
      ? "16PF, NEO-PI-R, or a published instrument we should add"
      : "Tell us what you'd like added";

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-neutral-700 leading-relaxed">
        Want us to test a specific model or add a specific instrument? Tell us what and why. We read every
        submission.
      </p>
      <div className="grid md:grid-cols-[auto_1fr] gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "model" | "instrument" | "other")}
          className="px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm"
        >
          <option value="model">Add a model</option>
          <option value="instrument">Add an instrument</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          required
          placeholder={placeholder}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm focus:outline-none focus:border-[var(--primary)]"
        />
      </div>
      <textarea
        placeholder="Why? Optional context that helps us prioritize."
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm focus:outline-none focus:border-[var(--primary)]"
      />
      <input
        type="email"
        placeholder="Your email (optional — for updates on your request)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm focus:outline-none focus:border-[var(--primary)]"
      />
      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {status === "loading" ? "…" : "Submit request"}
        </button>
        {message ? (
          <p className={"text-xs " + (status === "success" ? "text-[var(--positive)]" : "text-[var(--warning)]")}>
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
