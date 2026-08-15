// Central font tokens. Custom fonts in React Native are selected by an explicit
// family name per weight (fontWeight alone does NOT pick the bold cut of a
// custom font), so we expose semantic helpers that map a desired weight to the
// correct loaded family.
//
// - Lora (serif): used for scripture / reading content.
// - Inter (sans): used for all UI chrome (titles, buttons, tabs, list rows).

export const FONT_FAMILIES = {
  // Reading (serif)
  serifRegular: "Lora_400Regular",
  serifMedium: "Lora_500Medium",
  serifSemiBold: "Lora_600SemiBold",
  serifBold: "Lora_700Bold",
  serifItalic: "Lora_400Regular_Italic",

  // UI (sans)
  sansRegular: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
};

// Map a numeric/string weight to the matching UI (Inter) family.
export function uiFont(weight) {
  switch (String(weight)) {
    case "700":
    case "bold":
      return FONT_FAMILIES.sansBold;
    case "600":
      return FONT_FAMILIES.sansSemiBold;
    case "500":
      return FONT_FAMILIES.sansMedium;
    default:
      return FONT_FAMILIES.sansRegular;
  }
}

// Map a numeric/string weight to the matching reading (Lora) family.
export function readingFont(weight) {
  switch (String(weight)) {
    case "700":
    case "bold":
      return FONT_FAMILIES.serifBold;
    case "600":
      return FONT_FAMILIES.serifSemiBold;
    case "500":
      return FONT_FAMILIES.serifMedium;
    default:
      return FONT_FAMILIES.serifRegular;
  }
}
