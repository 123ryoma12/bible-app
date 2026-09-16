// NoteText — renders a study note string with **bold** and _italic_ markdown.
// Parses inline spans in a single pass using a regex that matches both markers.
// Usage: <NoteText text={note} style={baseStyle} boldStyle={boldStyle} italicStyle={italicStyle} />

import React from "react";
import { Text } from "react-native";

// Matches **bold** or _italic_ spans (non-greedy).
const INLINE_RE = /\*\*(.+?)\*\*|_(.+?)_/g;

export default function NoteText({ text, style, boldStyle, italicStyle }) {
  if (!text) return null;

  // Fast path — no markers present
  if (!text.includes("**") && !text.includes("_")) {
    return <Text style={style}>{text}</Text>;
  }

  const spans = [];
  let last = 0;
  let match;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > last) {
      spans.push({ kind: "plain", text: text.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      spans.push({ kind: "bold", text: match[1] });
    } else {
      spans.push({ kind: "italic", text: match[2] });
    }
    last = match.index + match[0].length;
  }

  // Remaining plain text after the last match
  if (last < text.length) {
    spans.push({ kind: "plain", text: text.slice(last) });
  }

  return (
    <Text style={style}>
      {spans.map((span, i) => {
        if (span.kind === "bold") {
          return <Text key={i} style={boldStyle}>{span.text}</Text>;
        }
        if (span.kind === "italic") {
          return <Text key={i} style={italicStyle}>{span.text}</Text>;
        }
        return span.text;
      })}
    </Text>
  );
}
