import { useState } from "react";
import { ChatMessage, processAgentQuery } from "@/lib/aiAgentChat";

function nowTimestamp(): string {
  return new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

// Shared local (zero-network) AI-coach chat loop used by both the full AI chat
// modal and the Gym-Floor Lite view. Keeps the user/agent message state and the
// simulated "typing" delay in one place.
export function useLocalAgentChat(initialGreeting: string, responseDelayMs = 450) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      sender: "agent",
      text: initialGreeting,
      timestamp: nowTimestamp(),
    },
  ]);

  const send = (text?: string) => {
    const query = (text ?? input).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: nowTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!text) setInput("");
    setLoading(true);

    setTimeout(() => {
      const response = processAgentQuery(query);
      setMessages((prev) => [...prev, response]);
      setLoading(false);
    }, responseDelayMs);
  };

  return { input, setInput, messages, loading, send };
}
