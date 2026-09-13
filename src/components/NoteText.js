// NoteText — renders a study note string with **bold** markdown support.
// Splits on **...** delimiters and alternates between normal and bold spans.
// Usage: <NoteText text={note} style={baseStyle} boldStyle={boldStyle} />

import React from "react";
import { Text } from "react-native";

export default function NoteText({ text, style, boldStyle }) {
  if (!text) return null;

  // Fast path — no bold markers present
  if (!text.includes("**")) {
    return <Text style={style}>{text}</Text>;
  }

  const parts = text.split("**");
  // Odd-indexed parts are inside ** ... **
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={boldStyle}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
