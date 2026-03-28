import ExpoModulesCore
import WidgetKit

public class WidgetDataModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WidgetData")

        AsyncFunction("setWidgetData") { (jsonString: String) in
            guard let defaults = UserDefaults(suiteName: "group.com.github.taikonohimazin.poinotice") else {
                throw Exception(name: "ERR_APP_GROUP", description: "Failed to access App Group UserDefaults")
            }
            defaults.set(jsonString, forKey: "widgetTimers")
            defaults.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
