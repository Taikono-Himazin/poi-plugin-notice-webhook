import WidgetKit
import SwiftUI

// MARK: - Data Models

struct TimerData: Codable {
    let type: String
    let message: String
    let completesAt: String
    let slot: Int?
}

struct WidgetTimerData: Codable {
    let timers: [TimerData]
    let lastSync: Double?
}

struct ActiveTimer {
    let type: String
    let message: String
    let completesAt: Date
    let slot: Int?

    var typeLabel: String {
        switch type {
        case "expedition":   return "遠征"
        case "repair":       return "入渠"
        case "construction": return "建造"
        default:             return type
        }
    }

    var typeColor: Color {
        switch type {
        case "expedition":   return Color(red: 0.345, green: 0.396, blue: 0.949)
        case "repair":       return Color(red: 0.341, green: 0.949, blue: 0.529)
        case "construction": return Color(red: 0.996, green: 0.906, blue: 0.361)
        default:             return .gray
        }
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

        // タイマー完了時刻ごとにエントリを生成し、完了したタイマーを順次除外する
        var entries: [PoiEntry] = []
        var remaining = allTimers

        // 現在の状態
        entries.append(PoiEntry(date: now, timers: remaining, lastSync: lastSyncDate, diag: diag))

        // 各タイマー完了時点のエントリ（完了したものを除外した状態）
        let expirations = remaining.map(\.completesAt).sorted()
        for expireDate in expirations {
            remaining = remaining.filter { $0.completesAt > expireDate }
            let d: WidgetDiagState = remaining.isEmpty ? .allExpired : .ok
            entries.append(PoiEntry(date: expireDate, timers: remaining, lastSync: lastSyncDate, diag: d))
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
                guard completeDate > now else { return nil }
                return ActiveTimer(type: timer.type, message: timer.message,
                                   completesAt: completeDate, slot: timer.slot)
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

// MARK: - Views

private let bgColor = Color(red: 0.059, green: 0.059, blue: 0.102)

struct SmallWidgetView: View {
    let entry: PoiEntry

    var body: some View {
        if let timer = entry.timers.first {
            VStack(alignment: .leading, spacing: 6) {
                Text(timer.typeLabel)
                    .font(.caption2).fontWeight(.bold)
                    .foregroundColor(bgColor)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(timer.typeColor)
                    .cornerRadius(4)

                Text(timer.message)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundColor(.white)
                    .lineLimit(2)

                Spacer()

                Text(timer.completesAt, style: .relative)
                    .font(.title2).fontWeight(.bold)
                    .foregroundColor(.white)
                    .monospacedDigit()

                if entry.timers.count > 1 {
                    Text("他 \(entry.timers.count - 1) 件")
                        .font(.caption2).foregroundColor(.gray)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(spacing: 6) {
                Image(systemName: "bell.slash")
                    .font(.title2).foregroundColor(.gray)
                Text("タイマーなし")
                    .font(.caption).foregroundColor(.gray)
                if entry.diag != .ok {
                    Text(entry.diag.rawValue)
                        .font(.system(size: 9)).foregroundColor(.orange)
                }
                if let sync = entry.lastSync {
                    Text(sync, style: .relative)
                        .font(.system(size: 9)).foregroundColor(Color(white: 0.4))
                }
            }
        }
    }
}

struct MediumWidgetView: View {
    let entry: PoiEntry

    var body: some View {
        if entry.timers.isEmpty {
            HStack {
                Spacer()
                VStack(spacing: 6) {
                    Image(systemName: "bell.slash")
                        .font(.title2).foregroundColor(.gray)
                    Text("進行中のタイマーなし")
                        .font(.caption).foregroundColor(.gray)
                    if entry.diag != .ok {
                        Text(entry.diag.rawValue)
                            .font(.system(size: 10)).foregroundColor(.orange)
                    }
                    if let sync = entry.lastSync {
                        Text("同期: ").font(.system(size: 10)).foregroundColor(Color(white: 0.4))
                        + Text(sync, style: .relative).font(.system(size: 10)).foregroundColor(Color(white: 0.4))
                    }
                }
                Spacer()
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(entry.timers.prefix(3).enumerated()), id: \.offset) { _, timer in
                    HStack(spacing: 8) {
                        Text(timer.typeLabel)
                            .font(.caption2).fontWeight(.bold)
                            .foregroundColor(bgColor)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(timer.typeColor)
                            .cornerRadius(3)
                            .frame(width: 40)

                        Text(timer.message)
                            .font(.caption).foregroundColor(.white)
                            .lineLimit(1)

                        Spacer()

                        Text(timer.completesAt, style: .relative)
                            .font(.caption).fontWeight(.bold)
                            .foregroundColor(.white)
                            .monospacedDigit()
                    }
                }

                if entry.timers.count > 3 {
                    Text("他 \(entry.timers.count - 3) 件")
                        .font(.caption2).foregroundColor(.gray)
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
        case .systemMedium:
            MediumWidgetView(entry: entry)
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
                    .containerBackground(bgColor, for: .widget)
            } else {
                PoiWidgetEntryView(entry: entry)
                    .padding()
                    .background(bgColor)
            }
        }
        .configurationDisplayName("poi タイマー")
        .description("遠征・入渠・建造の残り時間を表示します")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
