import ExpoModulesCore
import WidgetKit

public class WidgetDataModule: Module {
    private let suiteName = "group.com.github.taikonohimazin.poinotice"
    private let dataKey = "widgetTimers"
    private let diagKey = "widgetDiag"

    public func definition() -> ModuleDefinition {
        Name("WidgetData")

        AsyncFunction("setWidgetData") { (jsonString: String) in
            guard let defaults = UserDefaults(suiteName: self.suiteName) else {
                throw Exception(name: "ERR_APP_GROUP", description: "Failed to access App Group UserDefaults")
            }
            defaults.set(jsonString, forKey: self.dataKey)

            // 診断用: 書き込み時刻と文字列長を記録
            let diag: [String: Any] = [
                "writeTime": ISO8601DateFormatter().string(from: Date()),
                "dataLength": jsonString.count,
            ]
            if let diagJson = try? JSONSerialization.data(withJSONObject: diag),
               let diagStr = String(data: diagJson, encoding: .utf8) {
                defaults.set(diagStr, forKey: self.diagKey)
            }

            defaults.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }

        // App Group の読み書きテスト + 現在の保存データを返す
        AsyncFunction("getWidgetDiagnostics") { () -> String in
            guard let defaults = UserDefaults(suiteName: self.suiteName) else {
                return "{\"error\":\"App Group UserDefaults not accessible\"}"
            }

            var result: [String: Any] = [
                "appGroupAccessible": true,
                "suiteId": self.suiteName,
            ]

            // 保存済みデータの確認
            if let jsonString = defaults.string(forKey: self.dataKey) {
                result["dataExists"] = true
                result["dataLength"] = jsonString.count

                // JSON パース可否
                if let data = jsonString.data(using: .utf8) {
                    do {
                        let obj = try JSONSerialization.jsonObject(with: data)
                        if let dict = obj as? [String: Any],
                           let timers = dict["timers"] as? [[String: Any]] {
                            result["timerCount"] = timers.count
                            // 最初のタイマーの completesAt を返す（デバッグ用）
                            if let first = timers.first, let ca = first["completesAt"] as? String {
                                result["firstCompletesAt"] = ca
                            }
                        }
                        result["jsonValid"] = true
                    } catch {
                        result["jsonValid"] = false
                        result["jsonError"] = error.localizedDescription
                    }
                }
            } else {
                result["dataExists"] = false
            }

            // 診断メタデータ
            if let diagStr = defaults.string(forKey: self.diagKey) {
                result["lastWrite"] = diagStr
            }

            let jsonData = try! JSONSerialization.data(withJSONObject: result)
            return String(data: jsonData, encoding: .utf8) ?? "{}"
        }
    }
}
