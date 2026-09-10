import GameController
import UIKit
import WebKit
import XCTest

@MainActor
final class ControllerNavigationTests: XCTestCase {
    private var controller: GCController!

    override func setUp() async throws {
        continueAfterFailure = false
        controller = GCController.withExtendedGamepad()
    }

    func testControllerNavigatesAndHighlightsSlotActions() async throws {
        let webView = try await controllerSurface()
        controller.extendedGamepad?.dpad.setValueForXAxis(1, yAxis: 0)
        try await waitForJavaScript("document.activeElement?.id === 'box-0-slot-1'", in: webView)
        controller.extendedGamepad?.dpad.setValueForXAxis(0, yAxis: 0)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('ArrowRight:false')",
            in: webView
        )

        controller.extendedGamepad?.buttonA.setValue(1)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('Enter:true') && document.querySelector('[role=\"dialog\"][aria-label=\"Slot actions\"]') !== null && document.activeElement?.id === 'slot-action-0'",
            in: webView
        )
        controller.extendedGamepad?.buttonA.setValue(0)

        controller.extendedGamepad?.dpad.setValueForXAxis(0, yAxis: -1)
        try await waitForJavaScript(
            "document.activeElement?.id === 'slot-action-1' && document.activeElement.classList.contains('controller-focused') && getComputedStyle(document.activeElement).outlineStyle === 'solid'",
            in: webView
        )
        controller.extendedGamepad?.dpad.setValueForXAxis(0, yAxis: 0)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('ArrowDown:false')",
            in: webView
        )

        controller.extendedGamepad?.buttonB.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=\"dialog\"][aria-label=\"Slot actions\"]') === null && document.activeElement?.id === 'box-0-slot-1'",
            in: webView
        )
        controller.extendedGamepad?.buttonB.setValue(0)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('Escape:false')",
            in: webView
        )
    }

    func testJoystickAndShortcutButtonsFollowKeyboardNavigation() async throws {
        let webView = try await controllerSurface()
        _ = try await webView.evaluateJavaScript("document.querySelector('#box-0-slot-0').focus()")
        try await waitForJavaScript("document.activeElement?.id === 'box-0-slot-0'", in: webView)

        controller.extendedGamepad?.leftThumbstick.setValueForXAxis(1, yAxis: 0)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('ArrowRight:true') && document.activeElement?.id === 'box-0-slot-1'",
            in: webView
        )
        controller.extendedGamepad?.leftThumbstick.setValueForXAxis(0, yAxis: 0)

        controller.extendedGamepad?.buttonX.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=\"dialog\"][aria-label=\"Box Menu\"]') !== null && document.activeElement?.id === 'box-menu-command-0' && getComputedStyle(document.activeElement).outlineStyle === 'solid'",
            in: webView
        )
        controller.extendedGamepad?.buttonX.setValue(0)

        for index in 1...3 {
            controller.extendedGamepad?.dpad.setValueForXAxis(0, yAxis: -1)
            try await waitForJavaScript(
                "document.activeElement?.id === 'box-menu-command-\(index)'",
                in: webView
            )
            controller.extendedGamepad?.dpad.setValueForXAxis(0, yAxis: 0)
            try await waitForJavaScript(
                "window.__pksxControllerEvents?.includes('ArrowDown:false')",
                in: webView
            )
        }

        controller.extendedGamepad?.buttonA.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=\"dialog\"][aria-label=\"Open another collection\"]') !== null && document.activeElement?.classList.contains('source-card')",
            in: webView
        )
        controller.extendedGamepad?.buttonA.setValue(0)

        controller.extendedGamepad?.buttonB.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=\"dialog\"][aria-label=\"Open another collection\"]') === null && document.activeElement?.id === 'box-menu-command-3'",
            in: webView
        )
        controller.extendedGamepad?.buttonB.setValue(0)

        controller.extendedGamepad?.buttonB.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=\"dialog\"][aria-label=\"Box Menu\"]') === null && document.activeElement?.id === 'box-0-slot-1'",
            in: webView
        )
        controller.extendedGamepad?.buttonB.setValue(0)

        controller.extendedGamepad?.rightShoulder.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 02')",
            in: webView
        )
        controller.extendedGamepad?.rightShoulder.setValue(0)

        controller.extendedGamepad?.leftShoulder.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 01')",
            in: webView
        )
    }

    func testStartAndXDispatchFreshDiscretePresses() async throws {
        let webView = try await controllerSurface()

        controller.extendedGamepad?.buttonMenu.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]') !== null && window.__pksxControllerDetails?.filter(value => value === 'Menu:true:true').length === 1",
            in: webView
        )
        controller.extendedGamepad?.buttonMenu.setValue(1)
        try await waitForJavaScript(
            "window.__pksxControllerDetails?.filter(value => value === 'Menu:true:true').length === 1",
            in: webView
        )
        NotificationCenter.default.post(name: .GCControllerDidDisconnect, object: controller)
        try await waitForJavaScript(
            "window.__pksxControllerDetails?.includes('Menu:false:true')",
            in: webView
        )
        controller.extendedGamepad?.buttonMenu.setValue(0)
        _ = try await webView.evaluateJavaScript(
            "window.__pksxControllerConnected = false; window.addEventListener('pksxcontrollerconnection', () => window.__pksxControllerConnected = true, { once: true })"
        )
        NotificationCenter.default.post(name: .GCControllerDidConnect, object: controller)
        try await waitForJavaScript("window.__pksxControllerConnected === true", in: webView)
        controller.extendedGamepad?.buttonMenu.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]') === null",
            in: webView
        )
        controller.extendedGamepad?.buttonMenu.setValue(0)
        _ = try await webView.evaluateJavaScript("window.__pksxControllerDetails = []")

        controller.extendedGamepad?.buttonX.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]') !== null && window.__pksxControllerDetails?.includes('x:true:true')",
            in: webView
        )
        controller.extendedGamepad?.buttonX.setValue(0)
        try await waitForJavaScript(
            "window.__pksxControllerDetails?.includes('x:false:true')",
            in: webView
        )
        _ = try await webView.evaluateJavaScript("window.__pksxControllerEvents = []")
        controller.extendedGamepad?.buttonB.setValue(1)
        try await waitForJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]') === null",
            in: webView
        )
        controller.extendedGamepad?.buttonB.setValue(0)
        try await waitForJavaScript(
            "window.__pksxControllerEvents?.includes('Escape:false')",
            in: webView
        )
    }

    func testPhoneWidthUsesDestinationLayoutWithoutPersistentChrome() async throws {
        let webView = try await controllerSurface()
        try await waitForJavaScript(
            "innerWidth <= 1024 && document.querySelector('.top-bar,.mobile-tabbar') === null && document.querySelector('.main-menu-opener') !== null && getComputedStyle(document.querySelector('.box-sidebar')).display === 'none'",
            in: webView
        )
    }

    func testSafeAreaFallbackPreservesWebKitInsets() async throws {
        let webView = try await controllerSurface()
        try await waitForJavaScript("document.readyState === 'complete'", in: webView)
        let preservesInsets = try await webView.evaluateJavaScript(
            """
            (() => {
                const raw = document.createElement('div');
                const fallback = document.createElement('div');
                raw.style.padding = 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
                fallback.style.padding = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) var(--safe-area-inset-right, env(safe-area-inset-right, 0px)) var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) var(--safe-area-inset-left, env(safe-area-inset-left, 0px))';
                document.body.append(raw, fallback);
                const rawStyle = getComputedStyle(raw);
                const fallbackStyle = getComputedStyle(fallback);
                const matches = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
                    .every(property => rawStyle[property] === fallbackStyle[property]);
                raw.remove();
                fallback.remove();
                return matches;
            })()
            """
        ) as? Bool
        XCTAssertEqual(preservesInsets, true)
    }

    func testSettingsReportsInstalledAppVersion() async throws {
        let webView = try await controllerSurface()
        let installedVersion = try XCTUnwrap(
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        )
        _ = try await webView.evaluateJavaScript("window.__pksxSettingsDocument = 'alive'")
        try await chooseMainMenu("Settings", in: webView)
        try await waitForJavaScript(
            "window.__pksxSettingsDocument === 'alive' && document.querySelector('[data-testid=\"app-version\"]')?.textContent === '\(installedVersion)' && document.querySelector('[data-testid=\"app-platform\"]')?.textContent === 'iOS'",
            in: webView
        )
    }

    private func controllerSurface() async throws -> WKWebView {
        let webView = try appWebView()
        try await waitForJavaScript(
            "document.readyState === 'complete' && document.querySelector('.main-menu-opener') !== null && ((document.querySelector('.boxes-route')?.dataset.initialState === 'ready' && document.querySelector('#box-grid')?.getClientRects().length > 0) || (document.querySelector('[data-destination-root]')?.dataset.destinationRoot !== 'boxes' && document.querySelector('[data-destination-root]')?.dataset.initialState === 'ready'))",
            in: webView,
            timeout: 60
        )
        let hasBoxGrid = try await webView.evaluateJavaScript(
            "document.querySelector('#box-grid') !== null"
        ) as? Bool
        if hasBoxGrid != true {
            try await chooseMainMenu("Boxes", in: webView)
        }
        try await waitForJavaScript(
            "document.readyState === 'complete' && document.querySelector('.boxes-route')?.dataset.initialState === 'ready' && document.querySelector('#box-grid')?.getClientRects().length > 0",
            in: webView
        )
        _ = try await webView.evaluateJavaScript("document.querySelector('#box-grid').focus()")
        _ = try await webView.evaluateJavaScript(
            "window.__pksxControllerConnected = false; window.__pksxControllerEvents = []; window.__pksxControllerDetails = []; if (window.__pksxControllerListener) window.removeEventListener('pksxcontroller', window.__pksxControllerListener); window.__pksxControllerListener = event => { window.__pksxControllerEvents.push(event.detail.key + ':' + event.detail.pressed); window.__pksxControllerDetails.push(event.detail.key + ':' + event.detail.pressed + ':' + event.detail.discrete); }; window.addEventListener('pksxcontroller', window.__pksxControllerListener); window.addEventListener('pksxcontrollerconnection', () => window.__pksxControllerConnected = true, { once: true })"
        )
        NotificationCenter.default.post(name: .GCControllerDidConnect, object: controller)
        try await waitForJavaScript("window.__pksxControllerConnected === true", in: webView)
        return webView
    }

    private func chooseMainMenu(_ label: String, in webView: WKWebView) async throws {
        _ = try await webView.evaluateJavaScript("document.querySelector('.main-menu-opener').click()")
        try await waitForJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]') !== null",
            in: webView
        )
        _ = try await webView.evaluateJavaScript(
            "[...document.querySelectorAll('.main-menu-row button')].find(button => button.querySelector('strong')?.textContent === '\(label)').click()"
        )
    }

    private func appWebView() throws -> WKWebView {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return try XCTUnwrap(
            windows.lazy.compactMap(findWebView).first,
            "The app WebView is unavailable"
        )
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView {
            return webView
        }
        return view.subviews.lazy.compactMap(findWebView).first
    }

    private func waitForJavaScript(
        _ script: String,
        in webView: WKWebView,
        timeout: TimeInterval = 20
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? await webView.evaluateJavaScript(script)) as? Bool == true {
                return
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let state = try? await webView.evaluateJavaScript(
            "JSON.stringify({activeId: document.activeElement?.id, dialogs: [...document.querySelectorAll('[role=dialog]')].map(dialog => dialog.getAttribute('aria-label')), controllerEvents: window.__pksxControllerEvents})"
        )
        XCTFail("Timed out waiting for JavaScript: \(script), state: \(state ?? "unavailable")")
    }
}
