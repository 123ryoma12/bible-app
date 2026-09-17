package pnunag.bibleapp.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.*
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.layout.*
import androidx.glance.text.*

// Key mirrors the name written by src/data/widgetBridge.js.
private val KEY_REFERENCE = stringPreferencesKey("widget_memory_reference")

class MemoryWidget : GlanceAppWidget() {

    /** Exact sizing so typography can scale with the placed widget size. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read from Glance state inside provideContent so recomposition sees
        // each new sync — see the note on pushPrefsToGlanceState.
        provideContent {
            val state = currentState<Preferences>()
            MemoryWidgetContent(reference = state[KEY_REFERENCE] ?: "")
        }
    }
}

@Composable
private fun MemoryWidgetContent(reference: String) {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("bibleapp://memory")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val hasVerse = reference.isNotBlank()

    // Label above a single large reference line.
    val type = rememberTypeScale(1.7f)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(WidgetTheme.cardBackground)
            .clickable(actionStartActivity(launchIntent)),
    ) {
        Row(modifier = GlanceModifier.fillMaxSize()) {

            AccentStripe()

            Row(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .padding(
                        start = WidgetTheme.H_PADDING_DP.dp,
                        end   = WidgetTheme.H_PADDING_DP.dp,
                    ),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Column(modifier = GlanceModifier.defaultWeight()) {
                    SectionLabel("MEMORISE NEXT", fontSize = type.label)
                    Spacer(modifier = GlanceModifier.height(2.dp))
                    Text(
                        text = if (hasVerse) reference else "No verses yet",
                        style = TextStyle(
                            color = if (hasVerse) WidgetTheme.Heading else WidgetTheme.Muted,
                            fontSize = if (hasVerse) type.title else type.body,
                            fontWeight = FontWeight.Bold,
                            fontStyle = if (hasVerse) FontStyle.Normal else FontStyle.Italic,
                        ),
                        maxLines = 1,
                    )
                }

                Spacer(modifier = GlanceModifier.width(10.dp))

                StatusPill(
                    text = if (hasVerse) "Review" else "Add verse",
                    fontSize = type.caption,
                )
            }
        }
    }
}

class MemoryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MemoryWidget()
}
