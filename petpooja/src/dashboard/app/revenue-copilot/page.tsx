"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick‑prompt suggestions
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "How can I increase revenue this week?",
  "Which items should I upsell tonight?",
  "What combos should I promote?",
  "Which item's price can I safely raise?",
  "Why are my Monday revenues low?",
  "Which items are Hidden Gold?",
  "How can I boost dinner revenue?",
  "What should I promote today?",
];

// ─────────────────────────────────────────────────────────────────────────────
// Simple Markdown renderer (bold, headers, bullets, code)
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let tableBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} style={{ margin: "6px 0 6px 18px", padding: 0 }}>
        {listBuffer.map((li, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {inlineMd(li)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const flushTable = () => {
    if (tableBuffer.length < 2) {
      tableBuffer = [];
      return;
    }
    const rows = tableBuffer
      .filter((r) => !/^\s*\|[-\s:|]+\|\s*$/.test(r))
      .map((r) =>
        r.split("|").map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length)
      );
    if (rows.length === 0) { tableBuffer = []; return; }
    const headers = rows[0];
    const body = rows.slice(1);
    elements.push(
      <div key={`tbl-${elements.length}`} style={{ overflowX: "auto", margin: "8px 0" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <thead>
            <tr>
              {headers.map((h, hi) => (
                <th
                  key={hi}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    borderBottom: "2px solid #e2e8f0",
                    fontWeight: 700,
                    color: "#374151",
                    whiteSpace: "nowrap",
                    background: "#f8fafc",
                  }}
                >
                  {inlineMd(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f9fafb" }}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "5px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inlineMd(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // table row
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushList();
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    // bullet
    const bulletMatch = line.match(/^\s*[-•*]\s+(.*)/);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]);
      continue;
    }
    // numbered list
    const numMatch = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (numMatch) {
      listBuffer.push(numMatch[1]);
      continue;
    }

    flushList();

    // headers
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} style={{ margin: "12px 0 4px", fontSize: 13, fontWeight: 700, color: "#374151" }}>{inlineMd(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} style={{ margin: "14px 0 4px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{inlineMd(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} style={{ margin: "16px 0 6px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{inlineMd(line.slice(2))}</h2>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
    } else {
      elements.push(<p key={i} style={{ margin: "3px 0", lineHeight: 1.55 }}>{inlineMd(line)}</p>);
    }
  }
  flushList();
  flushTable();
  return <>{elements}</>;
}

function inlineMd(text: string): React.ReactNode {
  // Split by bold (**text**) and inline code (`text`)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) {
      parts.push(<strong key={idx++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={idx++} style={{ background: "#f1f5f9", borderRadius: 3, padding: "1px 4px", fontSize: "0.92em" }}>
          {match[3]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#94a3b8",
            animation: "copilotBounce 1.2s infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function RevenueCopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/revenue-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: updatedMessages.slice(-10),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${res.status})`);
        }

        const data = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Something went wrong. Please try again."}` },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, loading]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* bounce animation */}
      <style>{`
        @keyframes copilotBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>

      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          boxSizing: "border-box",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              ₹
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Revenue Copilot</h1>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>AI-powered revenue intelligence for Tadka &amp; Twist</p>
            </div>
          </div>
          <a href="/" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none" }}>← Back to Dashboard</a>
        </div>

        {/* ── Quick prompts ──────────────────────────────────────── */}
        {messages.length === 0 && (
          <div style={{ marginBottom: 20, flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Ask me anything about your restaurant revenue
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    borderRadius: 20,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#334155",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#6366f1";
                    e.currentTarget.style.color = "#6366f1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.color = "#334155";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Chat window ────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            background: "#fff",
            padding: 16,
            marginBottom: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                Your Revenue Intelligence Assistant
              </p>
              <p style={{ fontSize: 13, maxWidth: 380, margin: "0 auto" }}>
                Ask questions about your menu performance, pricing strategy, upsell opportunities, and more.
                Every answer is grounded in your real analytics data.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? "linear-gradient(135deg, #6366f1, #818cf8)" : "#f8fafc",
                  color: msg.role === "user" ? "#fff" : "#1e293b",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  boxShadow: msg.role === "user" ? "0 2px 8px rgba(99,102,241,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
                  border: msg.role === "assistant" ? "1px solid #e2e8f0" : "none",
                }}
              >
                {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "16px 16px 16px 4px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <TypingIndicator />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── Input area ─────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about revenue, upsells, pricing, combos…"
            disabled={loading}
            rows={1}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: 14,
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              outline: "none",
              background: loading ? "#f8fafc" : "#fff",
              resize: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 14,
              border: "none",
              background: loading || !input.trim() ? "#cbd5e1" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              boxShadow: loading || !input.trim() ? "none" : "0 2px 8px rgba(99,102,241,0.3)",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Thinking…" : "Send"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
          Insights are based on your restaurant&apos;s analytics data. Always verify before acting.
        </p>
      </div>
    </>
  );
}
