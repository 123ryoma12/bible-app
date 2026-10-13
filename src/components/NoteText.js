// Inline emphasis and contextual Scripture links shared by every note surface.
import React, { useMemo } from "react";
import { Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { BOOKS } from "../data/books";
import { parseStudyNote } from "../data/scriptureReferences";

export default function NoteText({ text, style, boldStyle, italicStyle, bookId, chapterNumber, onReferencePress }) {
  const { colors } = useTheme();
  const spans = useMemo(() => parseStudyNote(text || '', { bookId, chapterNumber }), [text, bookId, chapterNumber]);
  if (!text) return null;
  return (
    <Text style={style}>
      {spans.map((span, i) => {
        const reference = onReferencePress && span.reference;
        const name = reference && BOOKS.find((book) => book.id === reference.bookId)?.name;
        return (
          <Text
            key={i}
            style={[
              span.kind === 'bold' && boldStyle,
              span.kind === 'italic' && italicStyle,
              reference && { color: colors.accent, textDecorationLine: 'underline' },
            ]}
            accessibilityRole={reference ? 'link' : undefined}
            accessibilityLabel={reference ? `Open ${name} ${reference.chapterNumber}${reference.verseNumber ? `:${reference.verseNumber}` : ''} in a new tab` : undefined}
            onPress={reference ? (event) => {
              event.stopPropagation?.();
              onReferencePress(reference);
            } : undefined}
          >{span.text}</Text>
        );
      })}
    </Text>
  );
}
