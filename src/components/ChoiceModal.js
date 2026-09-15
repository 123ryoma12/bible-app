// Cross-platform replacement for Alert.alert.
//
// React Native Web's Alert is a no-op, so anything built on Alert.alert simply
// does nothing in the web build — including destructive confirmations, which is
// the worst place to silently fail. This renders the same idea as a real Modal
// so it behaves identically on iOS, Android, and web.
//
// Handles both shapes Alert.alert is normally used for:
//   * a confirmation  — "Delete this?" [Cancel] [Delete]
//   * an action sheet — a list of things you can do to a row
//
// Styling deliberately mirrors the existing modals (MemoryScreen's
// prioritisation sheet, the prayer goal modal) so it doesn't look bolted on.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

/**
 * @param {boolean}  visible
 * @param {string}   title
 * @param {string}  [message]
 * @param {Array}    actions  [{ label, style?: "default"|"destructive"|"cancel", onPress? }]
 *                            A "cancel" action just dismisses unless it has its
 *                            own onPress. If none is supplied, a Cancel is added.
 * @param {Function} onDismiss
 */
export default function ChoiceModal({ visible, title, message, actions = [], onDismiss }) {
  const { colors } = useTheme();

  const hasCancel = actions.some((a) => a.style === "cancel");
  const allActions = hasCancel
    ? actions
    : [...actions, { label: "Cancel", style: "cancel" }];

  function handlePress(action) {
    // Dismiss first so the modal is never left open behind a follow-up screen
    // transition or a second modal.
    onDismiss?.();
    action.onPress?.();
  }

  function colorFor(style) {
    if (style === "destructive") return colors.danger;
    if (style === "cancel") return colors.secondaryText;
    return colors.accent;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        {/* Inner touchable swallows taps so pressing the card doesn't dismiss. */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.surfaceText }]}>{title}</Text>
            {!!message && (
              <Text style={[styles.message, { color: colors.secondaryText }]}>{message}</Text>
            )}
          </View>

          <ScrollView bounces={false}>
            {allActions.map((action, index) => (
              <TouchableOpacity
                key={`${action.label}-${index}`}
                style={[styles.action, { borderTopColor: colors.border }]}
                onPress={() => handlePress(action)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.actionText,
                    {
                      color: colorFor(action.style),
                      fontFamily: action.style === "cancel" ? uiFont(500) : uiFont(600),
                    },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: 520,
    borderRadius: 16,
    overflow: "hidden",
  },
  head: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 16, fontFamily: uiFont(700), textAlign: "center" },
  message: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  action: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 15, alignItems: "center" },
  actionText: { fontSize: 15 },
});
