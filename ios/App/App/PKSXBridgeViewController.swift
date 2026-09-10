import Capacitor
import GameController

final class PKSXBridgeViewController: CAPBridgeViewController {
    private var controllerObservers: [NSObjectProtocol] = []
    private var directionStates: [String: Set<String>] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()

        let center = NotificationCenter.default
        controllerObservers = [
            center.addObserver(
                forName: .GCControllerDidConnect,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                guard let controller = notification.object as? GCController else { return }
                self?.bind(controller)
            },
            center.addObserver(
                forName: .GCControllerDidDisconnect,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                guard let controller = notification.object as? GCController else { return }
                self?.unbind(controller)
            },
        ]
        GCController.controllers().forEach(bind)
    }

    deinit {
        controllerObservers.forEach(NotificationCenter.default.removeObserver)
    }

    private func bind(_ controller: GCController) {
        guard let gamepad = controller.extendedGamepad else { return }
        let controllerID = ObjectIdentifier(controller).hashValue

        sendConnection(controller)

        gamepad.dpad.valueChangedHandler = { [weak self, weak controller] _, x, y in
            guard let controller else { return }
            self?.updateDirections(
                source: "\(controllerID)-dpad",
                x: x,
                y: y,
                controller: controller
            )
        }
        gamepad.leftThumbstick.valueChangedHandler = { [weak self, weak controller] _, x, y in
            guard let controller else { return }
            self?.updateDirections(
                source: "\(controllerID)-stick",
                x: x,
                y: y,
                controller: controller
            )
        }

        bind(gamepad.buttonA, to: "Enter", controller: controller)
        bind(gamepad.buttonB, to: "Escape", controller: controller)
        bind(gamepad.buttonX, to: "x", controller: controller)
        bind(gamepad.buttonY, to: "y", controller: controller)
        bind(gamepad.leftShoulder, to: "PageUp", controller: controller)
        bind(gamepad.rightShoulder, to: "PageDown", controller: controller)
        bind(gamepad.leftTrigger, to: "PageUp", controller: controller)
        bind(gamepad.rightTrigger, to: "PageDown", controller: controller)
        bind(gamepad.buttonMenu, to: "Menu", controller: controller)
    }

    private func bind(
        _ button: GCControllerButtonInput,
        to key: String,
        controller: GCController
    ) {
        button.pressedChangedHandler = { [weak self, weak controller] _, _, pressed in
            guard let controller else { return }
            self?.send(key: key, pressed: pressed, discrete: true, controller: controller)
        }
    }

    private func updateDirections(
        source: String,
        x: Float,
        y: Float,
        controller: GCController
    ) {
        let threshold: Float = 0.55
        var next = Set<String>()
        if x <= -threshold { next.insert("ArrowLeft") }
        if x >= threshold { next.insert("ArrowRight") }
        if y <= -threshold { next.insert("ArrowDown") }
        if y >= threshold { next.insert("ArrowUp") }

        let previous = directionStates[source] ?? []
        for key in previous.subtracting(next) {
            send(key: key, pressed: false, discrete: false, controller: controller)
        }
        for key in next.subtracting(previous) {
            send(key: key, pressed: true, discrete: false, controller: controller)
        }
        directionStates[source] = next
    }

    private func unbind(_ controller: GCController) {
        guard let gamepad = controller.extendedGamepad else { return }
        gamepad.dpad.valueChangedHandler = nil
        gamepad.leftThumbstick.valueChangedHandler = nil
        let buttons = [
            (gamepad.buttonA, "Enter"),
            (gamepad.buttonB, "Escape"),
            (gamepad.buttonX, "x"),
            (gamepad.buttonY, "y"),
            (gamepad.leftShoulder, "PageUp"),
            (gamepad.rightShoulder, "PageDown"),
            (gamepad.leftTrigger, "PageUp"),
            (gamepad.rightTrigger, "PageDown"),
            (gamepad.buttonMenu, "Menu"),
        ]
        for (button, key) in buttons {
            button.pressedChangedHandler = nil
            send(key: key, pressed: false, discrete: true, controller: controller)
        }

        let controllerID = ObjectIdentifier(controller).hashValue
        for source in ["\(controllerID)-dpad", "\(controllerID)-stick"] {
            for key in directionStates.removeValue(forKey: source) ?? [] {
                send(key: key, pressed: false, discrete: false, controller: controller)
            }
        }
    }

    private func send(
        key: String,
        pressed: Bool,
        discrete: Bool,
        controller: GCController
    ) {
        let detail: [String: Any] = [
            "key": key,
            "pressed": pressed,
            "discrete": discrete,
            "id": controller.vendorName ?? "iOS controller",
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: detail),
            let json = String(data: data, encoding: .utf8)
        else { return }

        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('pksxcontroller',{detail:\(json)}))"
            )
        }
    }

    private func sendConnection(_ controller: GCController) {
        let detail = ["id": controller.vendorName ?? "iOS controller"]
        guard
            let data = try? JSONSerialization.data(withJSONObject: detail),
            let json = String(data: data, encoding: .utf8)
        else { return }

        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('pksxcontrollerconnection',{detail:\(json)}))"
            )
        }
    }
}
