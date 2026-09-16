// Bottom sheet listing sermons for the book (and chapter) currently open in the
// reader, sourced from Gospel in Life.
//
// Fetching is deliberately lazy: the listing is not requested until the sheet
// is opened and is never cached, so every open is a fresh look at the site.
// Closing the sheet aborts any request still in flight.
//
// The list is split into two sections — the exact chapter first, then the whole
// book — because the chapter is the reason you tapped, but the book is where
// you browse.
//
// A second view lists sermons whose audio has been downloaded (see
// sermonDownloads). It deliberately shares the same row, so downloading,
// removing and playing work identically wherever a sermon appears, and it is
// readable with no connection at all — which is when it earns its keep.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  SectionList,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { uiFont } from "../theme/fonts";
import { useTheme } from "../theme/ThemeContext";
import {
  fetchSermonsForChapter,
  clearSermonCache,
  isAbortError,
  ErrorKind,
  CONGREGATIONS,
} from "../data/combinedSermonApi";
import {
  useSermonSources,
  toggleSource,
  toggleCongregation,
} from "../data/sermonSourcesStore";
import {
  useSermonDownloads,
  downloadSermon,
  cancelDownload,
  removeDownload,
  formatDownloadSize,
  totalDownloadedBytes,
  DOWNLOADS_SUPPORTED,
} from "../data/sermonDownloads";

// Copy for each failure. Only transient problems offer a retry — showing one on
// a book that simply has no sermons would be a lie, since retrying can never
// change the answer.
const FAILURE_COPY = {
  [ErrorKind.OFFLINE]: {
    icon: "wifi-off",
    title: "Internet required",
    // Worth being explicit: this app reads offline, and a bare connection error
    // inside it could easily be misread as the Bible itself needing a network.
    body: "You'll need to be online to browse sermons. Your Bible reading works offline as usual.",
  },
  [ErrorKind.BLOCKED]: {
    icon: "shield-alert-outline",
    title: "Blocked by your browser",
    body: "The browser wouldn't allow the request. This doesn't happen in the mobile app.",
  },
  [ErrorKind.TIMEOUT]: {
    icon: "timer-sand",
    title: "Taking too long",
    body: "One or more sermon sources is slow to respond right now.",
  },
  [ErrorKind.SERVER]: {
    icon: "cloud-off-outline",
    title: "Couldn't reach sermon source",
    body: "A sermon site may be down for a moment. Try again shortly.",
  },
  [ErrorKind.UNKNOWN]: {
    icon: "alert-circle-outline",
    title: "Something went wrong",
    body: "Sermons couldn't be loaded just now.",
  },
};

export default function SermonSheet({
  visible,
  onClose,
  book,
  chapterNumber,
  onSelectSermon,
  activeSermonId,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const downloads = useSermonDownloads();
  const sources = useSermonSources();

  // browse | downloads | sources. Browsing is the default because the sheet
  // was opened from a chapter, and that chapter's sermons are the reason for
  // the tap.
  const [view, setView] = useState("browse");

  const [status, setStatus] = useState("loading"); // loading | ready | failed
  const [failureKind, setFailureKind] = useState(null);
  const [chapterSermons, setChapterSermons] = useState([]);
  const [bookSermons, setBookSermons] = useState([]);
  const [bookTotal, setBookTotal] = useState(0);
  // true once every GiL page has been fetched (or cache was used). While false
  // the book section shows a small inline spinner instead of a truncated list.
  const [bookReady, setBookReady] = useState(false);

  const abortRef = useRef(null);
  const bookName = book?.name;

  // Stable string keys for source selection — React compares these as effect
  // dependencies, so any change triggers a re-fetch automatically.
  const enabledSourcesKey = sources.enabledSources.slice().sort().join(",");
  const congregationsKey = sources.cornerstoneCongregations.slice().sort().join(",");

  // Refs updated synchronously on every render so the async load closure
  // always reads the latest values without being in the dependency array.
  const enabledSourcesRef = useRef(sources.enabledSources);
  const congregationsRef = useRef(sources.cornerstoneCongregations);
  enabledSourcesRef.current = sources.enabledSources;
  congregationsRef.current = sources.cornerstoneCongregations;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setFailureKind(null);
    setBookReady(false);

    // Read prefs synchronously from the ref — always current, never stale.
    const enabledSources = enabledSourcesRef.current.slice();
    const cornerstoneCongregations = congregationsRef.current.slice();

    try {
      const result = await fetchSermonsForChapter(bookName, chapterNumber, {
        signal: controller.signal,
        enabledSources,
        cornerstoneCongregations,
        onBookReady: ({ bookSermons: bs, bookTotal: bt, chapterSermons: cs }) => {
          if (controller.signal.aborted) return;
          if (cs) setChapterSermons(cs);
          setBookSermons(bs);
          setBookTotal(bt);
          setBookReady(true);
        },
      });
      if (controller.signal.aborted) return;

      setChapterSermons(result.chapterSermons);
      setBookSermons(result.bookSermons);
      setBookTotal(result.bookTotal);
      setBookReady(result.bookReady);
      setStatus("ready");
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setFailureKind(err?.kind ?? ErrorKind.UNKNOWN);
      setStatus("failed");
    }
  }, [bookName, chapterNumber, enabledSourcesKey, congregationsKey]);

  const prevSourceKeyRef = useRef(null);
  useEffect(() => {
    if (!visible || !bookName) return undefined;

    const sourceKey = enabledSourcesKey + "|" + congregationsKey;
    if (prevSourceKeyRef.current !== null && prevSourceKeyRef.current !== sourceKey) {
      // Source selection changed — invalidate cache so the fetch uses the new config.
      clearSermonCache();
    }
    prevSourceKeyRef.current = sourceKey;

    load();
    return () => abortRef.current?.abort();
  }, [visible, bookName, chapterNumber, enabledSourcesKey, congregationsKey, load]);

  // Every open starts on the chapter you're reading. Leaving the sheet parked
  // on Downloads would bury the reason it was opened.
  useEffect(() => {
    if (visible) setView("browse");
  }, [visible]);

  // Tapping the trailing control means different things depending on where the
  // sermon has got to, so the row asks for an action and this decides.
  const handleDownloadAction = useCallback(
    (sermon, state) => {
      if (state === "downloaded" || state === "remove") {
        Alert.alert(
          "Remove download?",
          `"${sermon.title}" will need to be downloaded again to play offline.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: () => removeDownload(sermon.id),
            },
          ]
        );
        return;
      }
      if (state === "downloading") {
        cancelDownload(sermon.id);
        return;
      }
      // Idle or previously failed — either way, try.
      downloadSermon(sermon);
    },
    []
  );

  // A book with no sermons at all. Resolved without hitting the sermon
  // endpoint, so this appears immediately rather than after a spinner.
  const bookIsEmpty =
    status === "ready" && bookReady && bookTotal === 0 && chapterSermons.length === 0;

  const sections = useMemo(() => {
    if (status !== "ready" || bookIsEmpty) return [];

    // Anything already listed under the chapter is dropped from the book list
    // so no sermon appears twice.
    const shownAbove = new Set(chapterSermons.map((s) => s.id));
    const remaining = shownAbove.size
      ? bookSermons.filter((s) => !shownAbove.has(s.id))
      : bookSermons;

    // The chapter's sermons are a subset of the book's, so the book count has
    // to shed them as well or the header would promise more than it lists.
    const remainingTotal = Math.max(bookTotal - shownAbove.size, 0);

    // When no chapter is specified (e.g. book intro screen), skip the chapter
    // section entirely and just show all book sermons.
    if (!chapterNumber) {
      return bookSermons.length || !bookReady ? [
        {
          key: "book",
          title: `All of ${bookName}`,
          count: bookReady ? bookTotal : 0,
          bookLoading: !bookReady,
          data: bookSermons.length ? bookSermons : [{ __bookSpinner: true }],
        },
      ] : [];
    }

    const built = [
      {
        key: "chapter",
        title: `${bookName} ${chapterNumber}`,
        // A sentinel keeps the section header visible so the absence of
        // chapter sermons is stated outright instead of silently omitted.
        data: chapterSermons.length ? chapterSermons : [{ __placeholder: true }],
      },
    ];

    // Show the book section if either: we have sermons to show, or the book is
    // still loading (so the spinner is visible). In short books every sermon
    // may belong to the current chapter — once fully loaded and nothing remains,
    // drop the section entirely.
    const showBookSection = !bookReady || remainingTotal > 0;
    if (showBookSection) {
      built.push({
        key: "book",
        title: shownAbove.size ? `Elsewhere in ${bookName}` : `All of ${bookName}`,
        count: bookReady ? remainingTotal : 0,
        bookLoading: !bookReady,
        data: bookReady && remaining.length ? remaining : [{ __bookSpinner: true }],
      });
    }

    return built;
  }, [status, bookIsEmpty, bookName, chapterNumber, chapterSermons, bookSermons, bookTotal, bookReady]);

  // Both views render the same row, and each row needs the same download
  // wiring, so it's assembled in one place.
  const renderSermonRow = useCallback(
    (sermon, { inDownloads = false } = {}) => {
      const id = String(sermon.id);
      const inFlight = downloads.active[id];
      const downloadState = downloads.byId[id]
        ? inDownloads
          ? "remove"
          : "downloaded"
        : inFlight?.failed
          ? "failed"
          : inFlight
            ? "downloading"
            : "idle";

      return (
        <SermonRow
          sermon={sermon}
          colors={colors}
          isActive={id === String(activeSermonId)}
          onPress={() => onSelectSermon?.(sermon)}
          downloadState={downloadState}
          progress={inFlight?.progress ?? null}
          onDownloadAction={() => handleDownloadAction(sermon, downloadState)}
        />
      );
    },
    [colors, downloads, activeSermonId, onSelectSermon, handleDownloadAction]
  );

  const renderDownloads = () => {
    if (!downloads.ready) {
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    if (!downloads.entries.length) {
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons
            name="tray-arrow-down"
            size={40}
            color={colors.mutedText}
          />
          <Text style={[styles.centredTitle, { color: colors.text }]}>
            Nothing downloaded yet
          </Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            Tap the download icon beside any sermon to keep a copy on your phone.
            Downloads play without a connection.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={downloads.entries}
        keyExtractor={(item) => item.id}
        extraData={downloads}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 12 }}
        renderItem={({ item }) => renderSermonRow(item, { inDownloads: true })}
      />
    );
  };

  const renderSources = () => {
    return (
      <SourcesPicker
        sources={sources}
        colors={colors}
        onToggleSource={toggleSource}
        onToggleCongregation={toggleCongregation}
      />
    );
  };

  const renderBody = () => {
    if (view === "downloads") return renderDownloads();
    if (view === "sources") return renderSources();

    if (status === "loading") {
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            Finding sermons…
          </Text>
        </View>
      );
    }

    if (status === "failed") {
      const copy = FAILURE_COPY[failureKind] ?? FAILURE_COPY[ErrorKind.UNKNOWN];
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons name={copy.icon} size={40} color={colors.mutedText} />
          <Text style={[styles.centredTitle, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>{copy.body}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: colors.accent }]}
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={[styles.retryText, { color: colors.accent }]}>Try again</Text>
          </TouchableOpacity>

          {/* Being offline is exactly when downloads matter, so say so instead
              of leaving them behind a tab the user may not think to check. */}
          {downloads.entries.length > 0 && (
            <TouchableOpacity
              style={styles.centredLink}
              onPress={() => setView("downloads")}
              accessibilityRole="button"
              accessibilityLabel={`Play your ${downloads.entries.length} downloaded sermons`}
            >
              <Text style={[styles.centredLinkText, { color: colors.accent }]}>
                Play your {downloads.entries.length} downloaded{" "}
                {downloads.entries.length === 1 ? "sermon" : "sermons"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (bookIsEmpty) {
      // Deliberately no retry button — this is a settled fact, not a failure.
      return (
        <View style={styles.centred}>
          <MaterialCommunityIcons
            name="book-off-outline"
            size={40}
            color={colors.mutedText}
          />
          <Text style={[styles.centredTitle, { color: colors.text }]}>
            No sermons for {bookName}
          </Text>
          <Text style={[styles.centredBody, { color: colors.mutedText }]}>
            None of your selected sources have sermons on this book yet.
          </Text>
        </View>
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item, index) =>
          item.__placeholder ? `placeholder-${index}` : String(item.id)
        }
        extraData={downloads}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 12 }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
              {section.title}
            </Text>
            {section.bookLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.mutedText}
                style={styles.sectionSpinner}
              />
            ) : section.count > 0 ? (
              <Text style={[styles.sectionCount, { color: colors.mutedText }]}>
                {section.count}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.__placeholder) {
            return (
              <Text style={[styles.inlineNote, { color: colors.mutedText }]}>
                No sermons on {bookName} {chapterNumber}.
              </Text>
            );
          }
          if (item.__bookSpinner) {
            return (
              <ActivityIndicator
                style={{ marginVertical: 20 }}
                color={colors.accent}
              />
            );
          }
          return renderSermonRow(item);
        }}
      />
    );
  };

  // The subtitle answers "what am I looking at" for whichever view is showing.
  const downloadedSize = formatDownloadSize(totalDownloadedBytes(downloads.entries));
  const headerSub =
    view === "downloads"
      ? downloads.entries.length
        ? [
            `${downloads.entries.length} ${
              downloads.entries.length === 1 ? "sermon" : "sermons"
            }`,
            downloadedSize,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Available offline"
      : view === "sources"
        ? "Choose your sermon sources"
        : chapterNumber ? `${bookName} ${chapterNumber}` : `All of ${bookName}`;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area above the sheet dismisses it. */}
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Sermons</Text>
              <Text style={[styles.headerSub, { color: colors.mutedText }]}>
                {headerSub}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close sermons"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <SheetTab
              label="Browse"
              colors={colors}
              active={view === "browse"}
              onPress={() => setView("browse")}
            />
            {/* Hidden where downloading isn't possible (web build). */}
            {DOWNLOADS_SUPPORTED && (
              <SheetTab
                label="Downloaded"
                count={downloads.entries.length}
                colors={colors}
                active={view === "downloads"}
                onPress={() => setView("downloads")}
              />
            )}
            <SheetTab
              label="Sources"
              colors={colors}
              active={view === "sources"}
              onPress={() => setView("sources")}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.body}>{renderBody()}</View>

        </View>
      </View>
    </Modal>
  );
}

// ── Sources picker ────────────────────────────────────────────────────────────

function SourcesPicker({
  sources,
  colors,
  onToggleSource,
  onToggleCongregation,
}) {
  const csEnabled = sources.enabledSources.includes("cornerstone");
  const gilEnabled = sources.enabledSources.includes("gospel-in-life");

  return (
    <FlatList
      data={[{ key: "content" }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={() => (
        <View>
          {/* Gospel in Life */}
          <View style={[styles.sourceSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => onToggleSource("gospel-in-life")}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: gilEnabled }}
              accessibilityLabel="Gospel in Life sermons"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: colors.text }]}>
                  Gospel in Life
                </Text>
                <Text style={[styles.sourceDesc, { color: colors.mutedText }]}>
                  Expository sermon library by Tim Keller and others
                </Text>
              </View>
              <ToggleChip on={gilEnabled} colors={colors} />
            </TouchableOpacity>
          </View>

          {/* Cornerstone Church */}
          <View style={[styles.sourceSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => onToggleSource("cornerstone")}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: csEnabled }}
              accessibilityLabel="Cornerstone Church sermons"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: colors.text }]}>
                  Cornerstone Church
                </Text>
                <Text style={[styles.sourceDesc, { color: colors.mutedText }]}>
                  Sermons from Cornerstone Presbyterian churches in Sydney
                </Text>
              </View>
              <ToggleChip on={csEnabled} colors={colors} />
            </TouchableOpacity>

            {/* Congregation picker — only shown when Cornerstone is enabled */}
            {csEnabled && (
              <View style={[styles.congregationList, { borderTopColor: colors.border }]}>
                <Text style={[styles.congregationHeader, { color: colors.mutedText }]}>
                  CONGREGATIONS
                </Text>
                {CONGREGATIONS.map((cong) => {
                  const on = sources.cornerstoneCongregations.includes(cong.id);
                  return (
                    <TouchableOpacity
                      key={cong.id}
                      style={styles.congregationRow}
                      onPress={() => onToggleCongregation(cong.id)}
                      activeOpacity={0.7}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={cong.label}
                    >
                      <Text
                        style={[
                          styles.congregationLabel,
                          { color: on ? colors.text : colors.mutedText },
                        ]}
                      >
                        {cong.label}
                      </Text>
                      <MaterialCommunityIcons
                        name={on ? "check-circle" : "circle-outline"}
                        size={20}
                        color={on ? colors.accent : colors.border}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}
    />
  );
}

function ToggleChip({ on, colors }) {
  return (
    <View
      style={[
        styles.toggleChip,
        {
          backgroundColor: on ? colors.accent : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          {
            backgroundColor: colors.background,
            transform: [{ translateX: on ? 16 : 0 }],
          },
        ]}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SheetTab({ label, count, colors, active, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.tab,
        active && { backgroundColor: colors.accent + "1F" },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.tabText,
          { color: active ? colors.accent : colors.mutedText },
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabBadge,
            { backgroundColor: active ? colors.accent : colors.border },
          ]}
        >
          <Text
            style={[
              styles.tabBadgeText,
              { color: active ? colors.accentContrast : colors.mutedText },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Copy and iconography for the trailing control, keyed by how far the sermon
// has got. Downloaded and failed are both tappable in place — one removes, the
// other retries — so the row never needs a second gesture to learn.
//
// `remove` is the Downloads tab's version of `downloaded`: everything in that
// list is downloaded, so a check against every row states the obvious. The slot
// is worth more as the action you actually came there for.
const DOWNLOAD_CONTROL = {
  idle: { icon: "tray-arrow-down", label: "Download for offline listening" },
  downloaded: { icon: "check-circle", label: "Downloaded. Tap to remove." },
  remove: { icon: "trash-can-outline", label: "Remove download" },
  failed: { icon: "alert-circle-outline", label: "Download failed. Tap to retry." },
};

function DownloadButton({ state, progress, colors, onPress }) {
  const isDownloading = state === "downloading";
  const control = DOWNLOAD_CONTROL[state] ?? DOWNLOAD_CONTROL.idle;

  // The trash stays muted rather than red: a list of twenty red icons reads as
  // alarm, and the destructive weight belongs on the confirmation instead.
  const tint =
    state === "downloaded"
      ? colors.accent
      : state === "failed"
        ? colors.danger
        : colors.mutedText;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.rowAction}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={
        isDownloading
          ? progress != null
            ? `Downloading, ${Math.round(progress * 100)} percent. Tap to cancel.`
            : "Downloading. Tap to cancel."
          : control.label
      }
    >
      {isDownloading ? (
        // A percentage where the server told us the size, a spinner where it
        // didn't. Either way the same tap cancels.
        progress != null ? (
          <Text style={[styles.rowProgress, { color: colors.accent }]}>
            {Math.round(progress * 100)}%
          </Text>
        ) : (
          <ActivityIndicator size="small" color={colors.accent} />
        )
      ) : (
        <MaterialCommunityIcons name={control.icon} size={21} color={tint} />
      )}
    </TouchableOpacity>
  );
}

function SermonRow({
  sermon,
  colors,
  isActive,
  onPress,
  downloadState,
  progress,
  onDownloadAction,
}) {
  const congregationLabel = sermon.congregationId
    ? (CONGREGATIONS.find(c => c.id === sermon.congregationId)?.label ?? sermon.congregationId)
    : null;
  const sourceLabel = sermon.source === "cornerstone"
    ? `Cornerstone${congregationLabel ? ` ${congregationLabel}` : ""}`
    : "Gospel in Life";
  const meta = [sermon.speaker, sermon.year].filter(Boolean).join(" · ");
  // The passage is the most useful thing to scan for, so it leads the subtitle
  // and is tinted to stand apart from the speaker and year.
  const spokenLabel = [sermon.title, sermon.passage, meta].filter(Boolean).join(", ");

  return (
    <TouchableOpacity
      style={[styles.row, isActive && { backgroundColor: colors.accent + "18" }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityState={{ selected: isActive }}
    >
      <MaterialCommunityIcons
        name={isActive ? "volume-high" : "play-circle-outline"}
        size={22}
        color={isActive ? colors.accent : colors.mutedText}
        style={styles.rowIcon}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.rowTitle, { color: isActive ? colors.accent : colors.text }]}
        >
          {sermon.title}
        </Text>
        {!!sermon.passage && (
          <Text style={[styles.rowPassage, { color: colors.accent }]}>
            {sermon.passage}
          </Text>
        )}
        <Text style={[styles.rowMeta, { color: colors.mutedText }]}>
          {meta}
          {!!meta ? "  ·  " : ""}
          <Text style={styles.rowSource}>{sourceLabel}</Text>
        </Text>
      </View>

      {DOWNLOADS_SUPPORTED && (
        <DownloadButton
          state={downloadState}
          progress={progress}
          colors={colors}
          onPress={onDownloadAction}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    height: "78%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  grabber: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  grabberBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 19,
    fontFamily: uiFont(700),
  },
  headerSub: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
  },

  // Browse / Downloaded switch
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabText: {
    fontSize: 13,
    fontFamily: uiFont(600),
  },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: "center",
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: uiFont(600),
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 11,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: uiFont(500),
  },
  sectionSpinner: {
    marginLeft: 6,
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: uiFont(500),
    lineHeight: 20,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: uiFont(400),
    marginTop: 2,
  },
  rowPassage: {
    fontFamily: uiFont(600),
  },
  rowSource: {
    fontFamily: uiFont(400),
    fontSize: 11,
    opacity: 0.6,
  },
  rowAction: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  rowProgress: {
    fontSize: 11,
    fontFamily: uiFont(600),
  },
  inlineNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    fontStyle: "italic",
    paddingHorizontal: 18,
    paddingVertical: 4,
  },

  // Loading / failure / empty
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  centredTitle: {
    fontSize: 16,
    fontFamily: uiFont(600),
    marginTop: 14,
    textAlign: "center",
  },
  centredBody: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: {
    fontSize: 14,
    fontFamily: uiFont(600),
  },
  centredLink: {
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  centredLinkText: {
    fontSize: 13,
    fontFamily: uiFont(600),
  },

  // Sources picker
  sourceSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  sourceLabel: {
    fontSize: 15,
    fontFamily: uiFont(600),
    marginBottom: 2,
  },
  sourceDesc: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
  },
  congregationList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
  },
  congregationHeader: {
    fontSize: 10,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
  },
  congregationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  congregationLabel: {
    fontSize: 14,
    fontFamily: uiFont(400),
  },

  // Toggle switch
  toggleChip: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
