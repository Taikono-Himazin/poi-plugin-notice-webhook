import WidgetKit
import SwiftUI

// MARK: - Data Models

struct TimerData: Codable {
    let type: String
    let message: String
    let widgetMessage: String?
    let completesAt: String
    let slot: Int?
    let durationSeconds: Double?
}

struct WidgetTimerData: Codable {
    let timers: [TimerData]
    let lastSync: Double?
}

struct ActiveTimer {
    let type: String
    let message: String
    let widgetMessage: String
    let completesAt: Date
    let slot: Int?
    let durationSeconds: Double?

    var typeLabel: String {
        switch type {
        case "expedition":   return "遠征"
        case "repair":       return "入渠"
        case "construction": return "建造"
        default:             return type
        }
    }

    func typeColor(for theme: WidgetTheme) -> Color {
        switch type {
        case "expedition":   return theme.expeditionColor
        case "repair":       return theme.repairColor
        case "construction": return theme.constructionColor
        default:             return .gray
        }
    }

    var typeIcon: String {
        switch type {
        case "expedition":   return "paperplane.fill"
        case "repair":       return "wrench.fill"
        case "construction": return "hammer.fill"
        default:             return "timer"
        }
    }

    func progress(at now: Date) -> Double {
        guard let duration = durationSeconds, duration > 0 else { return 0 }
        let remaining = completesAt.timeIntervalSince(now)
        return max(0, min(1, 1.0 - remaining / duration))
    }

    func remainingMinutes(at now: Date) -> Int {
        max(0, Int(ceil(completesAt.timeIntervalSince(now) / 60)))
    }

    func remainingFormatted(at now: Date) -> String {
        let total = max(0, Int(ceil(completesAt.timeIntervalSince(now))))
        let h = total / 3600
        let m = (total % 3600) / 60
        return String(format: "%02d:%02d", h, m)
    }
}

// MARK: - Timeline Entry

enum WidgetDiagState: String {
    case ok = ""
    case noDefaults = "App Group NG"
    case noData = "未同期"
    case decodeFailed = "データ不正"
    case allExpired = "全タイマー完了"
}

struct PoiEntry: TimelineEntry {
    let date: Date
    let timers: [ActiveTimer]
    let lastSync: Date?
    var diag: WidgetDiagState = .ok
}

// MARK: - Timeline Provider

struct PoiTimelineProvider: TimelineProvider {
    private let appGroupId = "group.com.github.taikonohimazin.poinotice"

    func placeholder(in context: Context) -> PoiEntry {
        PoiEntry(date: Date(), timers: [], lastSync: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PoiEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PoiEntry>) -> Void) {
        let (allTimers, lastSyncDate, diag) = loadTimers()
        let now = Date()

        // タイマー完了時刻ごとにエントリを生成（完了後も00:00で表示し続ける）
        var entries: [PoiEntry] = []

        // 現在の状態
        entries.append(PoiEntry(date: now, timers: allTimers, lastSync: lastSyncDate, diag: diag))

        // 各タイマー完了時点のエントリ（表示更新用、タイマーは除外しない）
        let expirations = allTimers.map(\.completesAt).sorted()
        for expireDate in expirations {
            entries.append(PoiEntry(date: expireDate, timers: allTimers, lastSync: lastSyncDate, diag: diag))
        }

        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: now)!
        completion(Timeline(entries: entries, policy: .after(nextUpdate)))
    }

    private func loadTimers() -> (timers: [ActiveTimer], lastSync: Date?, diag: WidgetDiagState) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            return ([], nil, .noDefaults)
        }
        guard let jsonString = defaults.string(forKey: "widgetTimers") else {
            return ([], nil, .noData)
        }
        guard let data = jsonString.data(using: .utf8),
              let widgetData = try? JSONDecoder().decode(WidgetTimerData.self, from: data)
        else {
            return ([], nil, .decodeFailed)
        }

        let now = Date()
        let iso = ISO8601DateFormatter()
        let isoFrac = ISO8601DateFormatter()
        isoFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let activeTimers = widgetData.timers
            .compactMap { timer -> ActiveTimer? in
                guard let completeDate = isoFrac.date(from: timer.completesAt)
                                      ?? iso.date(from: timer.completesAt) else { return nil }
                return ActiveTimer(type: timer.type, message: timer.message,
                                   widgetMessage: timer.widgetMessage ?? timer.message,
                                   completesAt: completeDate, slot: timer.slot,
                                   durationSeconds: timer.durationSeconds)
            }
            .sorted { $0.completesAt < $1.completesAt }

        let lastSyncDate = widgetData.lastSync.map { Date(timeIntervalSince1970: $0 / 1000) }
        let diag: WidgetDiagState = activeTimers.isEmpty && !widgetData.timers.isEmpty ? .allExpired : .ok
        return (activeTimers, lastSyncDate, diag)
    }

    private func loadEntry() -> PoiEntry {
        let (timers, lastSync, diag) = loadTimers()
        return PoiEntry(date: Date(), timers: timers, lastSync: lastSync, diag: diag)
    }
}

// MARK: - Theme

struct WidgetTheme {
    let background: Color
    let expeditionColor: Color
    let repairColor: Color
    let constructionColor: Color
    let primaryText: Color
    let slotText: Color
    let syncText: Color
    let trackFill: Color
    let dividerColor: Color

    static func forScheme(_ scheme: ColorScheme) -> WidgetTheme {
        switch scheme {
        case .dark:
            return WidgetTheme(
                background: Color(red: 0.059, green: 0.059, blue: 0.102),
                expeditionColor: Color(red: 0.482, green: 0.545, blue: 0.969),
                repairColor: Color(red: 0.341, green: 0.949, blue: 0.529),
                constructionColor: Color(red: 0.996, green: 0.906, blue: 0.361),
                primaryText: .white,
                slotText: .white.opacity(0.55),
                syncText: .white.opacity(0.5),
                trackFill: Color.white.opacity(0.12),
                dividerColor: Color.white.opacity(0.12)
            )
        @unknown default:
            return WidgetTheme(
                background: Color(red: 0.961, green: 0.961, blue: 0.980),
                expeditionColor: Color(red: 0.231, green: 0.298, blue: 0.753),
                repairColor: Color(red: 0.102, green: 0.541, blue: 0.271),
                constructionColor: Color(red: 0.541, green: 0.427, blue: 0.0),
                primaryText: .black.opacity(0.87),
                slotText: .black.opacity(0.5),
                syncText: .black.opacity(0.45),
                trackFill: Color.black.opacity(0.08),
                dividerColor: Color.black.opacity(0.08)
            )
        }
    }
}

private struct ThemeBackground: View {
    @Environment(\.colorScheme) var colorScheme
    var body: some View {
        WidgetTheme.forScheme(colorScheme).background
    }
}

// MARK: - Views

struct SmallWidgetView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: PoiEntry

    var body: some View {
        let theme = WidgetTheme.forScheme(colorScheme)

        if entry.timers.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "anchor")
                    .font(.title2).foregroundColor(.gray)
                Text("作戦行動なし")
                    .font(.caption).foregroundColor(.gray)
            }
        } else {
            let grouped = Dictionary(grouping: entry.timers, by: { $0.type })
            let typeOrder = ["expedition", "repair", "construction"]
            let now = entry.date

            VStack(alignment: .leading, spacing: 2) {
                ForEach(typeOrder, id: \.self) { type in
                    if let timers = grouped[type] {
                        HStack(spacing: 4) {
                            Image(systemName: timers[0].typeIcon)
                                .font(.system(size: 8))
                                .foregroundColor(timers[0].typeColor(for: theme))
                            Text(timers[0].typeLabel)
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(timers[0].typeColor(for: theme))
                        }
                        .padding(.top, type == typeOrder.first(where: { grouped[$0] != nil }) ? 0 : 2)

                        ForEach(timers, id: \.slot) { timer in
                            HStack(spacing: 4) {
                                Text("\(timer.slot ?? 0)")
                                    .font(.system(size: 7))
                                    .foregroundColor(theme.slotText)
                                    .frame(width: 8)

                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(theme.trackFill)
                                        Capsule().fill(timer.typeColor(for: theme))
                                            .frame(width: geo.size.width * timer.progress(at: now))
                                    }
                                }
                                .frame(height: 4)

                                Text(timer.remainingFormatted(at: now))
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundColor(timer.typeColor(for: theme))
                                    .monospacedDigit()
                                    .frame(minWidth: 28, alignment: .trailing)
                            }
                            .frame(height: 14)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct MediumWidgetView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: PoiEntry

    var body: some View {
        let theme = WidgetTheme.forScheme(colorScheme)

        if entry.timers.isEmpty {
            HStack {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "anchor")
                        .font(.title2).foregroundColor(.gray)
                    Text("作戦行動なし")
                        .font(.caption).foregroundColor(.gray)
                    if entry.diag != .ok {
                        Text(entry.diag.rawValue)
                            .font(.system(size: 10)).foregroundColor(.orange)
                    }
                    if let sync = entry.lastSync {
                        Text("同期: ").font(.system(size: 10)).foregroundColor(theme.syncText)
                        + Text(sync, style: .relative).font(.system(size: 10)).foregroundColor(theme.syncText)
                    }
                }
                Spacer()
            }
        } else {
            let grouped = Dictionary(grouping: entry.timers, by: { $0.type })
            let typeOrder = ["expedition", "repair", "construction"]
            let now = entry.date

            HStack(alignment: .top, spacing: 12) {
                ForEach(typeOrder, id: \.self) { type in
                    if let timers = grouped[type] {
                        VStack(alignment: .leading, spacing: 4) {
                            // Section header
                            HStack(spacing: 3) {
                                Image(systemName: timers[0].typeIcon)
                                    .font(.system(size: 9))
                                    .foregroundColor(timers[0].typeColor(for: theme))
                                Text(timers[0].typeLabel)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(timers[0].typeColor(for: theme))
                            }

                            ForEach(timers, id: \.slot) { timer in
                                HStack(spacing: 4) {
                                    Text("\(timer.slot ?? 0)")
                                        .font(.system(size: 8))
                                        .foregroundColor(theme.slotText)
                                        .frame(width: 8)

                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(theme.trackFill)
                                            Capsule().fill(timer.typeColor(for: theme))
                                                .frame(width: geo.size.width * timer.progress(at: now))
                                        }
                                    }
                                    .frame(height: 4)

                                    Text(timer.remainingFormatted(at: now))
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(timer.typeColor(for: theme))
                                        .monospacedDigit()
                                        .frame(minWidth: 28, alignment: .trailing)
                                }
                                .frame(height: 16)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

struct LargeWidgetView: View {
    @Environment(\.colorScheme) var colorScheme
    let entry: PoiEntry

    var body: some View {
        let theme = WidgetTheme.forScheme(colorScheme)

        if entry.timers.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "anchor")
                    .font(.title2).foregroundColor(.gray)
                Text("作戦行動なし")
                    .font(.caption).foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            let grouped = Dictionary(grouping: entry.timers, by: { $0.type })
            let typeOrder = ["expedition", "repair", "construction"]
            let now = entry.date

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(typeOrder.enumerated()), id: \.offset) { idx, type in
                    if let timers = grouped[type] {
                        if idx > 0 && grouped[typeOrder.prefix(idx).first(where: { grouped[$0] != nil }) ?? ""] != nil {
                            Divider().background(theme.dividerColor).padding(.vertical, 6)
                        }

                        // Section header
                        HStack(spacing: 5) {
                            Image(systemName: timers[0].typeIcon)
                                .font(.system(size: 11))
                                .foregroundColor(timers[0].typeColor(for: theme))
                            Text(timers[0].typeLabel)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(timers[0].typeColor(for: theme))

                            Spacer()

                            Text("\(timers.count)枠")
                                .font(.system(size: 10))
                                .foregroundColor(timers[0].typeColor(for: theme).opacity(0.6))
                        }
                        .padding(.bottom, 6)

                        // Timer rows
                        ForEach(timers, id: \.slot) { timer in
                            HStack(spacing: 8) {
                                Text("\(timer.slot ?? 0)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(theme.slotText)
                                    .frame(width: 12)

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(timer.widgetMessage)
                                        .font(.system(size: 12))
                                        .foregroundColor(theme.primaryText)
                                        .lineLimit(1)

                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(theme.trackFill)
                                            Capsule().fill(timer.typeColor(for: theme))
                                                .frame(width: geo.size.width * timer.progress(at: now))
                                        }
                                    }
                                    .frame(height: 4)
                                }

                                Text(timer.remainingFormatted(at: now))
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(timer.typeColor(for: theme))
                                    .monospacedDigit()
                                    .frame(minWidth: 56, alignment: .trailing)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                Spacer(minLength: 0)

                // Last sync
                if let lastSync = entry.lastSync {
                    HStack {
                        Spacer()
                        Text("同期: \(lastSync, style: .relative)前")
                            .font(.system(size: 9))
                            .foregroundColor(theme.syncText)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Lock Screen Widgets

struct InlineWidgetView: View {
    let entry: PoiEntry

    var body: some View {
        if let timer = entry.timers.first {
            Label {
                Text("\(timer.typeLabel) \(timer.remainingFormatted(at: entry.date))")
            } icon: {
                Image(systemName: timer.typeIcon)
            }
        } else {
            Label("作戦行動なし", systemImage: "anchor")
        }
    }
}

struct CircularWidgetView: View {
    let entry: PoiEntry

    var body: some View {
        if let timer = entry.timers.first {
            let progress = timer.progress(at: entry.date)
            Gauge(value: progress) {
                Image(systemName: timer.typeIcon)
            } currentValueLabel: {
                Text(timer.remainingFormatted(at: entry.date))
                    .font(.system(.caption, design: .rounded, weight: .bold))
            } minimumValueLabel: {
                Text("")
            } maximumValueLabel: {
                Text("")
            }
            .gaugeStyle(.accessoryCircular)
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "anchor")
                    .font(.title3)
            }
        }
    }
}

struct RectangularWidgetView: View {
    let entry: PoiEntry

    var body: some View {
        if entry.timers.isEmpty {
            HStack {
                Image(systemName: "anchor")
                    .font(.caption)
                Text("作戦行動なし")
                    .font(.caption)
            }
        } else {
            let now = entry.date
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(entry.timers.prefix(3).enumerated()), id: \.offset) { _, timer in
                    HStack(spacing: 4) {
                        Image(systemName: timer.typeIcon)
                            .font(.system(size: 9))
                            .frame(width: 12)

                        Gauge(value: timer.progress(at: now)) {
                            EmptyView()
                        }
                        .gaugeStyle(.linearCapacity)

                        Text(timer.remainingFormatted(at: now))
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .frame(minWidth: 26, alignment: .trailing)
                    }
                }
            }
        }
    }
}

struct PoiWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: PoiEntry

    var body: some View {
        switch family {
        case .systemLarge:
            LargeWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .accessoryInline:
            InlineWidgetView(entry: entry)
        case .accessoryCircular:
            CircularWidgetView(entry: entry)
        case .accessoryRectangular:
            RectangularWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Widget

struct PoiNoticeWidget: Widget {
    let kind = "PoiNoticeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PoiTimelineProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                PoiWidgetEntryView(entry: entry)
                    .containerBackground(for: .widget) { ThemeBackground() }
            } else {
                PoiWidgetEntryView(entry: entry)
                    .padding()
                    .background(ThemeBackground())
            }
        }
        .configurationDisplayName("poi タイマー")
        .description("遠征・入渠・建造の残り時間を表示します")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryInline, .accessoryCircular, .accessoryRectangular,
        ])
    }
}
