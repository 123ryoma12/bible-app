import { Alert, Platform } from "react-native";

// React Native Web's Alert.alert is a no-op, so use the browser dialogs there.
export function appAlert(title, message, buttons) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const prompt = [title, message].filter(Boolean).join("\n\n");
  const action = buttons?.find((button) => button.style !== "cancel" && button.onPress);
  if (action) {
    if (window.confirm(prompt)) action.onPress();
  } else {
    window.alert(prompt);
    buttons?.[0]?.onPress?.();
  }
}
