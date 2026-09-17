package pnunag.bibleapp.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.background
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import pnunag.bibleapp.R

/**
 * Shared visual language for all home screen widgets.
 *
 * Colours mirror `src/theme/palette.js` → `darkColors` exactly so the widgets
 * feel like a natural extension of the app in dark mode.
 */
object WidgetTheme {
    val Background = ColorProvider(Color(0xFF121212)) // darkColors.background
    val Surface    = ColorProvider(Color(0xFF2A2015)) // darkColors.surface
    val Accent     = ColorProvider(Color(0xFFD9A441)) // darkColors.accent
    val OnAccent   = ColorProvider(Color(0xFF1A1206)) // darkColors.accentContrast
    val Text       = ColorProvider(Color(0xFFEAEAEA)) // darkColors.text
    val Heading    = ColorProvider(Color(0xFFFFFFFF)) // darkColors.headingText
    val Secondary  = ColorProvider(Color(0xFF9A9A9A)) // darkColors.secondaryText
    val Muted      = ColorProvider(Color(0xFF8A8A8A)) // darkColors.mutedText
    val Border     = ColorProvider(Color(0xFF333333)) // darkColors.border

    /** Rounded dark card that every widget sits inside. */
    val cardBackground: ImageProvider get() = ImageProvider(R.drawable.widget_card_bg)

    /** Gold stripe drawn down the leading edge of each widget. */
    val accentStripe: ImageProvider get() = ImageProvider(R.drawable.widget_accent_stripe)

    /** Muted rounded pill for small status labels. */
    val pill: ImageProvider get() = ImageProvider(R.drawable.widget_pill_bg)

    /** Gold rounded pill used when a goal has been met. */
    val pillGold: ImageProvider get() = ImageProvider(R.drawable.widget_pill_gold_bg)

    // ── Layout constants ───────────────────────────────────────────────────
    const val STRIPE_WIDTH_DP  = 4f
    const val H_PADDING_DP     = 14f
    const val V_PADDING_DP     = 10f
}

/**
 * A set of font sizes derived from the widget's actual measured size, so text
 * stays visually proportional whether the user places a 4x1 or resizes to 4x3.
 *
 * @property label   small uppercase section label
 * @property title   primary heading (chapter / prayer name / verse reference)
 * @property body    running body copy
 * @property caption secondary metadata
 */
data class WidgetTypeScale(
    val label: TextUnit,
    val title: TextUnit,
    val body: TextUnit,
    val caption: TextUnit,
)

/**
 * Compute a type scale from the current widget size.
 *
 * Font sizes are driven by the vertical space available per "row" of content,
 * so a taller widget gets proportionally larger text rather than leaving the
 * text looking lost in empty space.
 *
 * @param contentRows approximate number of stacked text rows the widget draws.
 *                    Fractional values are allowed (e.g. 1.6 for a label above
 *                    a title plus a thin progress bar).
 */
@Composable
fun rememberTypeScale(contentRows: Float): WidgetTypeScale {
    val heightDp = LocalSize.current.height.value
    val usable   = (heightDp - WidgetTheme.V_PADDING_DP * 2).coerceAtLeast(24f)
    val perRow   = usable / contentRows.coerceAtLeast(1f)

    // Title takes a little under two-thirds of its row so ascenders/descenders
    // and line spacing still breathe.
    val title   = (perRow * 0.60f).coerceIn(15f, 34f)
    val label   = (title * 0.46f).coerceIn(9f, 15f)
    val body    = (title * 0.60f).coerceIn(11f, 19f)
    val caption = (title * 0.46f).coerceIn(9f, 14f)

    return WidgetTypeScale(
        label   = label.sp,
        title   = title.sp,
        body    = body.sp,
        caption = caption.sp,
    )
}

/**
 * Width in dp available to content, i.e. the widget width minus the accent
 * stripe and horizontal padding. Useful for sizing progress bars.
 */
@Composable
fun contentWidthDp(): Float {
    val widthDp = LocalSize.current.width.value
    return (widthDp - WidgetTheme.STRIPE_WIDTH_DP - WidgetTheme.H_PADDING_DP * 2)
        .coerceAtLeast(40f)
}

/** Small uppercase section label, e.g. "CONTINUE READING". */
@Composable
fun SectionLabel(text: String, fontSize: TextUnit) {
    Text(
        text = text,
        style = TextStyle(
            color = WidgetTheme.Accent,
            fontSize = fontSize,
            fontWeight = FontWeight.Bold,
        ),
        maxLines = 1,
    )
}

/**
 * Rounded status chip. Renders gold (high emphasis) when [highlight] is true,
 * otherwise a muted surface pill.
 */
@Composable
fun StatusPill(text: String, fontSize: TextUnit, highlight: Boolean = false) {
    val vPad = (fontSize.value * 0.30f).coerceIn(3f, 7f)
    val hPad = (fontSize.value * 0.72f).coerceIn(7f, 14f)
    Box(
        modifier = GlanceModifier
            .background(if (highlight) WidgetTheme.pillGold else WidgetTheme.pill)
            .padding(horizontal = hPad.dp, vertical = vPad.dp),
    ) {
        Text(
            text = text,
            style = TextStyle(
                color = if (highlight) WidgetTheme.OnAccent else WidgetTheme.Secondary,
                fontSize = fontSize,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )
    }
}

/** Gold vertical stripe used as the leading accent on every widget. */
@Composable
fun AccentStripe() {
    Box(
        modifier = GlanceModifier
            .width(WidgetTheme.STRIPE_WIDTH_DP.dp)
            .fillMaxHeight()
            .background(WidgetTheme.accentStripe),
    ) {}
}

/**
 * Slim rounded progress bar sized to the widget's content width.
 *
 * @param progress   0f..1f
 * @param trackWidth total track width in dp (see [contentWidthDp])
 * @param barHeight  thickness in dp
 */
@Composable
fun ProgressTrack(progress: Float, trackWidth: Float, barHeight: Float) {
    val filled = (trackWidth * progress.coerceIn(0f, 1f))
    Box(
        modifier = GlanceModifier
            .width(trackWidth.dp)
            .height(barHeight.dp)
            .background(WidgetTheme.pill),
    ) {
        if (filled > 0f) {
            Box(
                modifier = GlanceModifier
                    .width(filled.dp)
                    .height(barHeight.dp)
                    .background(WidgetTheme.pillGold),
            ) {}
        }
    }
}
