"use client";

import { useState } from "react";

import { ArrowRight, Check, ShieldCheck } from "lucide-react";

import { type Snapshot } from "@/lib/types";

import { Modal } from "./primitives";

export function ConnectHomeDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (snapshot: Snapshot) => Promise<void>;
}) {
  const [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [connecting, setConnecting] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError("");
    const secret = token;
    setToken("");
    try {
      const response = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, token: secret }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to connect.");
      setSuccess(true);
      await onConnected(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect.");
    } finally {
      setConnecting(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setToken("");
      }}
      title={success ? "Welcome to your home." : "Connect your home"}
      description={
        success
          ? "Your home’s next chapter starts here."
          : "Just your Home Assistant address and an access token."
      }
    >
      {success ? (
        <div className="connection-success">
          <span>
            <Check size={30} />
          </span>
          <h3>You’re connected.</h3>
          <p>Live activity is ready. We’re gathering the rest of your story.</p>
          <button
            className="primary-button full"
            onClick={() => onOpenChange(false)}
          >
            Watch your home
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={connect}>
          <label>
            Home Assistant URL
            <input
              required
              type="url"
              placeholder="http://homeassistant.local:8123"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="url"
            />
          </label>
          <label>
            Long-lived access token
            <input
              required
              type="password"
              placeholder="Paste your access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="field-help">
            Create a token in Home Assistant → your profile → Security.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button full" disabled={connecting}>
            {connecting ? "Connecting to your home…" : "Connect"}
            {connecting ? (
              <span className="spinner" />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
          <div className="security-note">
            <ShieldCheck size={18} />
            <p>
              Your token stays in this local server’s memory. It is never stored
              in your browser. Use <code>.env.local</code> to reconnect after a
              restart.
            </p>
          </div>
        </form>
      )}
    </Modal>
  );
}
