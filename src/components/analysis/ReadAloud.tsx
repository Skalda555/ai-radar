"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";

/** Splits long text so the browser speech queue does not cut off mid-article. */
function splitForSpeech(text: string, maxChunk = 240): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxChunk && current.length > 0) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Reads the text with the voices installed in the system (on Windows those are
 * Microsoft SAPI voices). Nothing is sent anywhere; synthesis runs locally.
 */
export function ReadAloud({ text, label = "Přečíst" }: { text: string; label?: string }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function speak() {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();

    const chunks = splitForSpeech(text);
    const voices = window.speechSynthesis.getVoices();
    const czech = voices.find((voice) => voice.lang?.toLowerCase().startsWith("cs"));

    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = czech?.lang ?? "cs-CZ";
      if (czech) utterance.voice = czech;
      utterance.rate = 1;
      utterance.pitch = 1;
      if (index === chunks.length - 1) {
        utterance.onend = () => setSpeaking(false);
      }
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    });

    setSpeaking(true);
  }

  if (!text.trim()) return null;

  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={speaking ? stop : speak}
      aria-pressed={speaking}
      title={speaking ? "Zastavit čtení" : "Přečíst nahlas hlasem z Windows"}
    >
      <Icon name={speaking ? "pause" : "volume"} size={15} />
      {speaking ? "Zastavit" : label}
    </button>
  );
}
