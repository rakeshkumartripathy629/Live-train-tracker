// Phase 10 — AI assistant conversation memory.
//
// One AiConversation per user chat thread; AiMessage rows store every turn
// (user, tool, assistant) so history survives restarts and the model can see
// real prior context — never fabricated.

const { Schema, model } = require("mongoose");

const AiConversationSchema = new Schema(
  {
    userId: { type: String, required: true },
    // Auto-generated from the first user message (no client input trusted).
    title: { type: String, default: "New chat" },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

AiConversationSchema.index({ userId: 1, updatedAt: -1 });

const AiMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // 'user' | 'assistant' | 'tool'
    role: { type: String, required: true, enum: ["user", "assistant", "tool"] },
    content: { type: String, default: "" },
    // For assistant tool-calling turns: which tools were invoked and their
    // real results (stored for audit, kept out of the prompt verbatim).
    toolName: { type: String, default: null },
    toolArgs: { type: Schema.Types.Mixed, default: null },
    toolResult: { type: Schema.Types.Mixed, default: null },
    // Sources cited in the answer (real tool names, for the UI).
    sources: { type: [String], default: [] },
    // Usage/audit metadata.
    tokensIn: { type: Number, default: 0 },
    tokensOut: { type: Number, default: 0 },
    model: { type: String, default: null },
    durationMs: { type: Number, default: 0 },
    // Prompt-injection guard flag: the user message was sanitized/flagged.
    flagged: { type: Boolean, default: false },
  },
  { timestamps: true },
);

AiMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = {
  AiConversation: model("AiConversation", AiConversationSchema),
  AiMessage: model("AiMessage", AiMessageSchema),
};
