const { withAndroidStyles } = require("expo/config-plugins");

// Android 15+ TextView defaults to glyph bounds for line wrapping, while RN
// 0.86's TextLayoutManager builds its measuring StaticLayout with advances.
// Use advances for both so the measured height includes every drawn line.
module.exports = function withAndroidTextMetrics(config) {
  return withAndroidStyles(config, (mod) => {
    const styles = mod.modResults.resources.style;
    const theme = styles.find((style) => style.$.name === "AppTheme");
    if (!theme) throw new Error("Cannot configure Android text metrics: AppTheme is missing");

    const styleName = "Widget.Bible.TextView";
    theme.item ??= [];
    let textViewStyle = theme.item.find((item) => item.$.name === "android:textViewStyle");
    let textStyle = styles.find((style) => style.$.name === styleName);
    if (!textStyle) {
      textStyle = {
        $: { name: styleName, parent: textViewStyle?._ ?? "Widget.AppCompat.TextView" },
        item: [],
      };
      styles.push(textStyle);
    }
    textStyle.item ??= [];
    const boundsItem = textStyle.item.find((item) => item.$.name === "android:useBoundsForWidth");
    if (boundsItem) boundsItem._ = "false";
    else textStyle.item.push({ $: { name: "android:useBoundsForWidth" }, _: "false" });

    if (textViewStyle) textViewStyle._ = `@style/${styleName}`;
    else theme.item.push({ $: { name: "android:textViewStyle" }, _: `@style/${styleName}` });
    return mod;
  });
};
