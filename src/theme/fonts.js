// Central font tokens. Custom fonts in React Native are selected by an explicit
// family name per weight (fontWeight alone does NOT pick the bold cut of a
// custom font), so we expose semantic helpers that map a desired weight to the
// correct loaded family.
//
// - Lora (serif): used for scripture / reading content.
// - Inter (sans): used for all UI chrome (titles, buttons, tabs, list rows).

export const FONT_FAMILIES = {
  // UI (sans)
  sansRegular: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
};

// The reading typefaces are deliberately bundled rather than relying on platform
// system fonts: each option looks the same offline on iOS, Android, and web.
export const READING_FONT_OPTIONS = [
  { key: "lora", label: "Lora", description: "Warm, literary serif" },
  { key: "crimson", label: "Crimson Text", description: "Classic book type" },
  { key: "merriweather", label: "Merriweather", description: "Strong and highly legible" },
  { key: "libre", label: "Libre Baskerville", description: "Traditional, refined serif" },
  { key: "sourceSerif", label: "Source Serif 4", description: "Clean, contemporary serif" },
];

const READING_FONTS = {
  lora: {
    regular: "Lora_400Regular",
    medium: "Lora_500Medium",
    semiBold: "Lora_600SemiBold",
    bold: "Lora_700Bold",
    italic: "Lora_400Regular_Italic",
  },
  crimson: {
    regular: "CrimsonText_400Regular",
    medium: "CrimsonText_600SemiBold",
    semiBold: "CrimsonText_600SemiBold",
    bold: "CrimsonText_700Bold",
    italic: "CrimsonText_400Regular_Italic",
  },
  merriweather: {
    regular: "Merriweather_400Regular",
    medium: "Merriweather_500Medium",
    semiBold: "Merriweather_600SemiBold",
    bold: "Merriweather_700Bold",
    italic: "Merriweather_400Regular_Italic",
  },
  libre: {
    regular: "LibreBaskerville_400Regular",
    medium: "LibreBaskerville_500Medium",
    semiBold: "LibreBaskerville_600SemiBold",
    bold: "LibreBaskerville_700Bold",
    italic: "LibreBaskerville_400Regular_Italic",
  },
  sourceSerif: {
    regular: "SourceSerif4_400Regular",
    medium: "SourceSerif4_500Medium",
    semiBold: "SourceSerif4_600SemiBold",
    bold: "SourceSerif4_700Bold",
    italic: "SourceSerif4_400Regular_Italic",
  },
};

export const DEFAULT_READING_FONT = "lora";

export function isReadingFontKey(value) {
  return Object.prototype.hasOwnProperty.call(READING_FONTS, value);
}

export function readingFont(fontKey = DEFAULT_READING_FONT, variant = "regular") {
  const family = READING_FONTS[isReadingFontKey(fontKey) ? fontKey : DEFAULT_READING_FONT];
  return family[variant] || family.regular;
}

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
