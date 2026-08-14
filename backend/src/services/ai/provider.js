// Phase 10 — LLM provider adapter (OpenAI-compatible chat completions).
//
// Every configured provider (groq / gemini / openai) speaks the same wire
// protocol, so this module is provider-agnostic: it only needs a base URL and
// an API key. Free-tier friendly (Groq, Gemini free tier, OpenRouter :free
// models, ...). When no AI_API_KEY is set, `isConfigured()` is false and the
// caller must refuse to answer — the assistant never fabricates a reply.
//
// Two operations:
//   chatCompletion(messages, { tools })  — non-streaming, used for tool rounds.
//   chatCompletionStream(messages, {...}) — SSE streaming, used for the final
//     answer so the UI can render tokens as they arrive.

const config = require("../../config/env");

class AIError extends Error {
  constructor(message, status = 502, code = "AI_ERROR") {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.code = code;
  }
}

function resolveBaseUrl() {
  if (config.ai.baseUrl) return config.ai.baseUrl.replace(/\/$/, "");
  return (
    config.ai.defaultBaseUrls[config.ai.provider] ||
    config.ai.defaultBaseUrls.groq
  );
}

function resolveModel() {
  return (
    config.ai.model ||
    config.ai.defaultModels[config.ai.provider] ||
    config.ai.defaultModels.groq
  );
}

function isConfigured() {
  return Boolean(config.ai.apiKey && config.ai.provider);
}

function buildBody({ messages, tools, stream }) {
  const body = {
    model: resolveModel(),
    messages,
    temperature: config.ai.temperature,
    max_tokens: config.ai.maxTokens,
    stream,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  return body;
}

async function rawRequest({ messages, tools, stream, signal }) {
  if (!isConfigured()) {
    throw new AIError(
      "AI assistant is not configured (AI_API_KEY missing)",
      503,
      "AI_NOT_CONFIGURED",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.ai.requestTimeoutMs,
  );
  const parentSignal = signal;
  if (parentSignal && parentSignal.aborted) controller.abort();
  const onAbort = () => controller.abort();
  if (parentSignal)
    parentSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(`${resolveBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBody({ messages, tools, stream })),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let code = "AI_ERROR";
      let detail = text;
      try {
        const json = JSON.parse(text);
        detail = json?.error?.message || text;
        if (json?.error?.code) code = String(json.error.code);
      } catch {
        // non-JSON body
      }
      if (res.status === 429) {
        throw new AIError(
          "AI provider rate limit reached. Try again in a minute.",
          429,
          "AI_RATE_LIMITED",
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new AIError(
          "AI provider rejected the API key.",
          502,
          "AI_AUTH_FAILED",
        );
      }
      throw new AIError(
        `AI provider error: ${detail || `HTTP ${res.status}`}`,
        502,
        code,
      );
    }
    return res;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onAbort);
  }
}

/**
 * Non-streaming completion. Returns { content, toolCalls, usage }.
 * toolCalls is [] when the model wants to answer directly.
 */
async function chatCompletion({ messages, tools = [], signal } = {}) {
  const res = await rawRequest({ messages, tools, stream: false, signal });
  const json = await res.json().catch(() => null);
  const choice = json?.choices && json.choices[0];
  if (!choice)
    throw new AIError(
      "AI provider returned an empty response",
      502,
      "AI_EMPTY_RESPONSE",
    );

  const message = choice.message || {};
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((tc) => ({
        id: tc.id || `call_${Date.now()}`,
        name: tc.function?.name || "",
        arguments: tc.function?.arguments || "{}",
      }))
    : [];

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls,
    usage: json.usage || null,
  };
}

/**
 * Streaming completion used for the final answer. Returns an async generator
 * of { type: 'content', text } | { type: 'tool_calls', calls } | { type: 'done', usage }.
 * Consumed by the SSE route which forwards each chunk to the browser.
 */
async function* chatCompletionStream({ messages, tools = [], signal } = {}) {
  const res = await rawRequest({ messages, tools, stream: true, signal });
  if (!res.body)
    throw new AIError(
      "AI provider returned no stream",
      502,
      "AI_STREAM_FAILED",
    );

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, sep).trim();
        buffer = buffer.slice(sep + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;

        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }

        const choice = json.choices && json.choices[0];
        if (!choice) continue;
        if (json.usage) usage = json.usage;

        const delta = choice.delta || {};
        if (typeof delta.content === "string" && delta.content) {
          yield { type: "content", text: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          // Streaming tool-call deltas (name first, then argument fragments).
          const calls = delta.tool_calls.map((tc) => ({
            index: tc.index || 0,
            id: tc.id || "",
            name: tc.function?.name || "",
            arguments: tc.function?.arguments || "",
          }));
          yield { type: "tool_calls", calls };
        }
      }
      if (buffer.includes("[DONE]")) break;
    }
  } finally {
    reader.releaseLock && reader.releaseLock();
  }
  yield { type: "done", usage };
}

module.exports = {
  AIError,
  isConfigured,
  resolveBaseUrl,
  resolveModel,
  chatCompletion,
  chatCompletionStream,
};
