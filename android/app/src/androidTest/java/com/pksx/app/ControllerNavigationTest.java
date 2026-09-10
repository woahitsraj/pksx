package com.pksx.app;

import static org.junit.Assert.fail;
import static org.junit.Assume.assumeTrue;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Build;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ControllerNavigationTest {
    private static final long TIMEOUT_SECONDS = 20;
    private static final long ENGINE_TIMEOUT_SECONDS = 60;

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
        new ActivityScenarioRule<>(MainActivity.class);

    private NativeDisplayFixture defaultDisplayFixture;

    @Before
    public void setDefaultNativeViewport() throws Exception {
        defaultDisplayFixture = new NativeDisplayFixture();
        defaultDisplayFixture.setViewport(360, 640, 1, false);
    }

    @After
    public void restoreNativeViewport() throws Exception {
        if (defaultDisplayFixture != null) defaultDisplayFixture.close();
    }

    @Test
    public void gamepadNavigatesAndHighlightsSlotActions() throws Exception {
        awaitControllerSurface();
        runJavaScript("location.assign('/?source=pokemon-storage')");
        awaitJavaScript(
            "location.search === '?source=pokemon-storage'"
                + " && document.querySelector('.boxes-route')?.dataset.initialState === 'ready'"
                + " && document.querySelector('#box-grid')?.getAttribute('aria-label')"
                + ".startsWith('Pokemon Storage Box 01')"
                + " && document.querySelector('#box-0-slot-1')?.textContent.includes('Empty')"
        );
        runJavaScript(
            "window.__pksxTestControllerEvents = [];"
                + " window.addEventListener('pksxcontroller', event =>"
                + " window.__pksxTestControllerEvents.push(event.detail.key + ':' + event.detail.pressed));"
                + " document.querySelector('#box-grid').focus()"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_RIGHT,
            "window.__pksxTestControllerEvents?.includes('ArrowRight:true')"
                + " && document.activeElement?.id === 'box-0-slot-1'"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_A,
            "(() => {"
                + " const dialog = document.querySelector('[role=\"dialog\"][aria-label=\"Slot actions\"]');"
                + " const buttons = [...(dialog?.querySelectorAll('button') ?? [])];"
                + " return buttons.length === 1"
                + " && buttons[0].textContent?.trim() === 'Close'"
                + " && document.activeElement === buttons[0]"
                + " && document.activeElement?.id === 'slot-action-0';"
                + " })()"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.id === 'slot-action-0'"
                + " && document.activeElement?.textContent?.trim() === 'Close'"
                + " && document.activeElement.classList.contains('controller-focused')"
                + " && getComputedStyle(document.activeElement).outlineStyle === 'solid'"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_B,
            "document.querySelector('[role=\"dialog\"][aria-label=\"Slot actions\"]') === null"
                + " && document.activeElement?.id === 'box-0-slot-1'"
        );
    }

    @Test
    public void joystickAndShortcutButtonsFollowKeyboardNavigation() throws Exception {
        awaitControllerSurface();
        runJavaScript("document.querySelector('#box-grid').focus()");

        moveJoystick(1f, 0f, "document.activeElement?.id === 'box-0-slot-1'");

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_X,
            "document.querySelector('[role=\"dialog\"][aria-label=\"Box Menu\"]') !== null"
                + " && document.activeElement?.id === 'box-menu-command-0'"
                + " && getComputedStyle(document.activeElement).outlineStyle === 'solid'"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.id === 'box-menu-command-1'"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.id === 'box-menu-command-2'"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.id === 'box-menu-command-3'"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_A,
            "document.querySelector('[role=\"dialog\"][aria-label=\"Open another collection\"]') !== null"
                + " && document.activeElement?.classList.contains('source-card')"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_B,
            "document.querySelector('[role=\"dialog\"][aria-label=\"Open another collection\"]') === null"
                + " && document.activeElement?.id === 'box-menu-command-3'"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_B,
            "document.querySelector('[role=\"dialog\"][aria-label=\"Box Menu\"]') === null"
                + " && document.activeElement?.id === 'box-0-slot-1'"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_R1,
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 02')"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_L1,
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 01')"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_R2,
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 02')"
        );

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_L2,
            "document.querySelector('.box-title h2')?.textContent?.includes('Box 01')"
        );
    }

    @Test
    public void startAndXDispatchFreshDiscretePresses() throws Exception {
        awaitControllerSurface();
        runJavaScript(
            "window.__pksxDiscreteEvents = [];"
                + " window.addEventListener('pksxcontroller', event =>"
                + " window.__pksxDiscreteEvents.push("
                + "event.detail.key + ':' + event.detail.pressed + ':' + event.detail.discrete));"
                + " document.querySelector('#box-grid').focus()"
        );

        long downTime = SystemClock.uptimeMillis();
        dispatchGamepadKey(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BUTTON_START, 0, downTime);
        awaitJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]')"
                + " && window.__pksxDiscreteEvents.filter(value => value === 'Menu:true:true').length === 1"
        );
        dispatchGamepadKey(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BUTTON_START, 1, downTime);
        SystemClock.sleep(250);
        awaitJavaScript(
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]')"
                + " && window.__pksxDiscreteEvents.filter(value => value === 'Menu:true:true').length === 1"
        );
        dispatchGamepadKey(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BUTTON_START, 0, downTime);
        awaitJavaScript("window.__pksxDiscreteEvents.includes('Menu:false:true')");

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_START,
            "document.querySelector('[role=dialog][aria-label=\"Main Menu\"]') === null"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_X,
            "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]')"
                + " && window.__pksxDiscreteEvents.includes('x:true:true')"
        );
        awaitJavaScript("window.__pksxDiscreteEvents.includes('x:false:true')");
    }

    @Test
    public void controllerBackGoesHomeWhilePlatformBackFollowsHistory() throws Exception {
        awaitControllerSurface();
        runJavaScript("window.__pksxNativeHistoryStart = history.length");
        importEmeraldSave();
        runJavaScript("document.querySelector('.save-card.active .save-menu-control').click()");
        awaitJavaScript("document.querySelector('[role=dialog][aria-label=\"Save File Menu\"]') !== null");
        runJavaScript("document.querySelector('#save-file-menu-command-2').click()");
        awaitJavaScript("document.querySelector('[role=dialog][aria-label^=\"Delete \"]') !== null");
        pressPlatformBack();
        awaitJavaScript(
            "location.pathname.endsWith('/saves')"
                + " && document.querySelector('[role=dialog][aria-label^=\"Delete \"]') === null"
                + " && document.querySelector('[role=dialog][aria-label=\"Save File Menu\"]') !== null"
        );
        runJavaScript("document.querySelector('#save-file-menu-command-2').click()");
        awaitJavaScript("document.querySelector('[role=dialog][aria-label^=\"Delete \"]') !== null");
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_B,
            "location.pathname.endsWith('/saves')"
                + " && document.querySelector('[role=dialog][aria-label^=\"Delete \"]') === null"
                + " && document.querySelector('[role=dialog][aria-label=\"Save File Menu\"]') !== null"
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_B,
            "document.querySelector('[role=dialog][aria-label=\"Save File Menu\"]') === null"
        );
        chooseMainMenu("Settings");
        awaitJavaScript("location.pathname.endsWith('/settings')");

        chooseMainMenu("Backup Browser");
        awaitJavaScript("document.querySelector('[role=dialog][aria-labelledby=\"backup-browser-title\"]')");
        pressPlatformBack();
        awaitJavaScript(
            "location.pathname.endsWith('/settings')"
                + " && document.querySelector('[role=dialog][aria-labelledby=\"backup-browser-title\"]') === null"
        );

        runJavaScript("window.__pksxSettingsHistoryLength = history.length");
        awaitJavaScript(
            "window.__pksxSettingsHistoryLength > window.__pksxNativeHistoryStart"
        );
        pressPlatformBack();
        awaitJavaScript("location.pathname.endsWith('/saves')");
        chooseMainMenu("Settings");
        awaitJavaScript("location.pathname.endsWith('/settings')");
        pressGamepadKey(KeyEvent.KEYCODE_BUTTON_B, "location.pathname === '/'");
    }

    @Test
    public void smallWidescreenUsesDestinationLayoutWithoutPersistentChrome() throws Exception {
        try (NativeDisplayFixture fixture = new NativeDisplayFixture()) {
            fixture.setViewport(360, 640, 1, false);
            awaitControllerSurface();
            awaitJavaScript(
                "innerWidth === 640 && innerHeight === 312"
                    + " && document.querySelector('.top-bar,.mobile-tabbar') === null"
                    + " && document.querySelector('.main-menu-opener') !== null"
                    + " && document.querySelector('.box-sidebar') === null"
                    + " && (() => {"
                    + " const route = document.querySelector('.boxes-route')?.getBoundingClientRect();"
                    + " const pane = document.querySelector('.box-pane')?.getBoundingClientRect();"
                    + " const grid = document.querySelector('.location-grid')?.getBoundingClientRect();"
                    + " const rail = document.querySelector('.detail-rail')?.getBoundingClientRect();"
                    + " return route && pane && grid && rail && pane.width > 0 && grid.height > 0"
                    + " && grid.left >= pane.left && grid.right <= pane.right"
                    + " && rail.left >= route.left && rail.right <= route.right;"
                    + " })()"
            );
        }
    }

    @Test
    public void syntheticSafeAreaInsetsControlShellPadding() throws Exception {
        awaitJavaScript("document.readyState === 'complete' && document.querySelector('.app-shell')");
        awaitJavaScript(
            "(() => {"
                + " const root = document.documentElement;"
                + " const sides = ['top', 'right', 'bottom', 'left'];"
                + " const previous = sides.map(side => root.style.getPropertyValue('--safe-area-inset-' + side));"
                + " ['20px', '21px', '22px', '23px'].forEach((value, index) =>"
                + " root.style.setProperty('--safe-area-inset-' + sides[index], value));"
                + " const shell = getComputedStyle(document.querySelector('.app-shell'));"
                + " const matches = shell.paddingTop === '20px' && shell.paddingRight === '21px'"
                + " && shell.paddingBottom === '22px' && shell.paddingLeft === '23px';"
                + " sides.forEach((side, index) => previous[index]"
                + " ? root.style.setProperty('--safe-area-inset-' + side, previous[index])"
                + " : root.style.removeProperty('--safe-area-inset-' + side));"
                + " return matches;"
                + " })()"
        );
    }

    @Test
    public void pre140WebViewKeepsShellContentInsideSystemBars() throws Exception {
        awaitControllerSurface();
        PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
        String provider = webViewPackage == null ? "unknown" : webViewPackage.packageName;
        String version = webViewPackage == null ? "unknown" : webViewPackage.versionName;
        assumeTrue(
            "Requires Android WebView below 140, actual provider: " + provider + " " + version,
            webViewPackage != null && Integer.parseInt(version.split("\\.")[0]) < 140
        );
        awaitJavaScript(
            "document.readyState === 'complete'"
                + " && document.querySelector('.app-shell') !== null"
                + " && document.querySelector('.boxes-route') !== null"
                + " && document.querySelector('.main-menu-opener') !== null"
        );

        JSONArray geometry = new JSONArray(
            runJavaScript(
                "(() => {"
                    + " const first = document.querySelector('#box-grid [id$=\"-slot-0\"]');"
                    + " const last = document.querySelector('#box-grid [id$=\"-slot-29\"]');"
                    + " first.scrollIntoView({ block: 'center' });"
                    + " const firstSlot = first.getBoundingClientRect();"
                    + " last.scrollIntoView({ block: 'center' });"
                    + " const lastSlot = last.getBoundingClientRect();"
                    + " const opener = document.querySelector('.main-menu-opener').getBoundingClientRect();"
                    + " const root = getComputedStyle(document.documentElement);"
                    + " return [innerWidth, innerHeight, firstSlot.left, firstSlot.top,"
                    + " firstSlot.right, firstSlot.bottom, lastSlot.left, lastSlot.top,"
                    + " lastSlot.right, lastSlot.bottom, opener.left, opener.top,"
                    + " opener.right, opener.bottom,"
                    + " root.getPropertyValue('--safe-area-inset-top'),"
                    + " root.getPropertyValue('--safe-area-inset-right'),"
                    + " root.getPropertyValue('--safe-area-inset-bottom'),"
                    + " root.getPropertyValue('--safe-area-inset-left')];"
                    + " })()"
            )
        );
        double innerWidth = geometry.getDouble(0);
        double innerHeight = geometry.getDouble(1);
        double[] firstSlotCss = {
            geometry.getDouble(2),
            geometry.getDouble(3),
            geometry.getDouble(4),
            geometry.getDouble(5)
        };
        double[] lastSlotCss = {
            geometry.getDouble(6),
            geometry.getDouble(7),
            geometry.getDouble(8),
            geometry.getDouble(9)
        };
        double[] openerCss = {
            geometry.getDouble(10),
            geometry.getDouble(11),
            geometry.getDouble(12),
            geometry.getDouble(13)
        };
        AtomicReference<Boolean> barsAvailable = new AtomicReference<>(false);
        AtomicReference<Boolean> contentContained = new AtomicReference<>(false);
        AtomicReference<String> evidence = new AtomicReference<>();
        activityRule
            .getScenario()
            .onActivity(
                activity -> {
                    WebView webView = activity.getBridge().getWebView();
                    int[] webViewOrigin = new int[2];
                    int[] decorOrigin = new int[2];
                    webView.getLocationOnScreen(webViewOrigin);
                    activity.getWindow().getDecorView().getLocationOnScreen(decorOrigin);
                    Rect decorBounds = new Rect(
                        decorOrigin[0],
                        decorOrigin[1],
                        decorOrigin[0] + activity.getWindow().getDecorView().getWidth(),
                        decorOrigin[1] + activity.getWindow().getDecorView().getHeight()
                    );
                    Rect webViewBounds = new Rect(
                        webViewOrigin[0],
                        webViewOrigin[1],
                        webViewOrigin[0] + webView.getWidth(),
                        webViewOrigin[1] + webView.getHeight()
                    );
                    WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(
                        activity.getWindow().getDecorView()
                    );
                    Insets systemBars = windowInsets == null
                        ? Insets.NONE
                        : windowInsets.getInsets(
                            WindowInsetsCompat.Type.systemBars() |
                            WindowInsetsCompat.Type.displayCutout()
                        );
                    Rect safeBounds = new Rect(
                        decorBounds.left + systemBars.left,
                        decorBounds.top + systemBars.top,
                        decorBounds.right - systemBars.right,
                        decorBounds.bottom - systemBars.bottom
                    );
                    double scaleX = webView.getWidth() / innerWidth;
                    double scaleY = webView.getHeight() / innerHeight;
                    RectF firstSlotBounds = screenBounds(webViewOrigin, scaleX, scaleY, firstSlotCss);
                    RectF lastSlotBounds = screenBounds(webViewOrigin, scaleX, scaleY, lastSlotCss);
                    RectF openerBounds = screenBounds(webViewOrigin, scaleX, scaleY, openerCss);
                    barsAvailable.set(systemBars.top > 0 && systemBars.bottom > 0);
                    contentContained.set(
                        scaleX > 0 &&
                        scaleY > 0 &&
                        contains(safeBounds, firstSlotBounds) &&
                        contains(safeBounds, lastSlotBounds) &&
                        contains(safeBounds, openerBounds)
                    );
                    evidence.set(
                        String.format(
                            Locale.US,
                            "provider=%s %s decor=%s webView=%s bars=%s safe=%s scale=%.3fx%.3f firstSlot=%s lastSlot=%s opener=%s cssVars=%s",
                            provider,
                            version,
                            decorBounds,
                            webViewBounds,
                            systemBars,
                            safeBounds,
                            scaleX,
                            scaleY,
                            firstSlotBounds,
                            lastSlotBounds,
                            openerBounds,
                            geometry.toString()
                        )
                    );
                }
            );
        assumeTrue(
            "Requires visible top and bottom system bars. " + evidence.get(),
            barsAvailable.get()
        );
        Log.i("PKSXAcceptance", evidence.get());
        if (!contentContained.get()) fail("Safe-area containment failed. " + evidence.get());
    }

    @Test
    public void controllerHighlightSurvivesRepeatedMainMenuNavigation() throws Exception {
        awaitControllerSurface();
        runJavaScript("document.querySelector('#box-grid').focus()");

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_START,
            controllerHighlightExpression("main-menu-entry-0")
        );

        for (int interaction = 0; interaction < 20; interaction++) {
            int keyCode = interaction % 2 == 0
                ? KeyEvent.KEYCODE_DPAD_DOWN
                : KeyEvent.KEYCODE_DPAD_UP;
            String expectedId = interaction % 2 == 0 ? "main-menu-entry-1" : "main-menu-entry-0";
            pressGamepadKey(keyCode, controllerHighlightExpression(expectedId));
        }

        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            controllerHighlightExpression("main-menu-entry-1")
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_A,
            "location.pathname.endsWith('/trainer')"
        );
    }

    @Test
    public void controllerFrameworkHighlightsContextEditorAndEveryFocusableControl()
        throws Exception {
        awaitControllerSurface();
        importEmeraldSave();
        chooseMainMenu("Boxes");
        awaitControllerSurface();
        awaitJavaScript("document.querySelector('#box-0-slot-0')?.textContent.includes('ARON')");
        runJavaScript("document.querySelector('#box-grid').focus()");

        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_A,
            "document.querySelector('[aria-label=\"Slot actions\"]') !== null"
        );
        assertAllFocusableControlsHighlighted("[aria-label=\"Slot actions\"]");
        runJavaScript("document.querySelector('#slot-action-0').focus()");
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_A,
            "document.querySelector('.pokemon-editor') !== null"
        );
        awaitJavaScript(controllerHighlightExpression("pokemon-editor-section-species-form"));
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            controllerHighlightExpression("pokemon-editor-section-nickname")
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_RIGHT,
            controllerHighlightExpression("pokemon-editor-nickname")
        );
        pressGamepadKey(
            KeyEvent.KEYCODE_BUTTON_Y,
            controllerHighlightExpression("pokemon-editor-nickname")
        );
        assertAllFocusableControlsHighlighted(".pokemon-editor");
    }

    @Test
    public void controllerFrameworkNavigatesAndHighlightsSaveScreens() throws Exception {
        awaitControllerSurface();
        importEmeraldSave();
        chooseMainMenu("Trainer");
        awaitJavaScript("location.pathname.endsWith('/trainer')");

        awaitJavaScript(
            "document.querySelector('[data-destination-root=\"trainer\"]')"
                + "?.dataset.initialState === 'ready'"
                + " && document.querySelector('[data-destination-focus=\"trainer-name\"]') !== null"
        );
        runJavaScript("document.querySelector('[data-destination-focus=\"trainer-name\"]').focus()");
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.dataset.destinationFocus !== 'trainer-name'"
                + " && document.activeElement?.closest('[data-destination-root=\"trainer\"]') !== null"
                + " && getComputedStyle(document.activeElement).outlineStyle === 'solid'"
        );
        assertAllFocusableControlsHighlighted("[data-destination-root=\"trainer\"]");

        chooseMainMenu("Saves");
        awaitJavaScript(
            "location.pathname.endsWith('/saves')"
                + " && document.querySelector('[data-destination-root=\"saves\"]')?.dataset.initialState === 'ready'"
        );
        runJavaScript("document.querySelector('[data-destination-focus=\"saves-grid\"]').focus()");
        pressGamepadKey(
            KeyEvent.KEYCODE_DPAD_DOWN,
            "document.activeElement?.dataset.destinationFocus === 'saves-grid'"
                + " && getComputedStyle(document.activeElement).outlineStyle === 'solid'"
        );
        assertAllFocusableControlsHighlighted(".saves-route");
    }

    @Test
    public void settingsReportsInstalledAppVersion() throws Exception {
        String installedVersion = InstrumentationRegistry
            .getInstrumentation()
            .getTargetContext()
            .getPackageManager()
            .getPackageInfo(
                InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(),
                0
            )
            .versionName;
        awaitControllerSurface();
        runJavaScript("window.__pksxSettingsDocument = 'alive'");
        chooseMainMenu("Settings");
        awaitJavaScript(
            "window.__pksxSettingsDocument === 'alive'"
                + " && location.pathname === '/settings'"
                + " && document.querySelector('[data-testid=\"app-version\"]')?.textContent === '"
                + installedVersion
                + "' && document.querySelector('[data-testid=\"app-platform\"]')?.textContent === 'Android'"
        );
    }

    @Test
    public void nativeRotationPreservesBoxesCarryMenuAndTakeover() throws Throwable {
        assumeTrue("Requires Android 11 display controls", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        assertActivityDoesNotLockOrientation();
        try (NativeDisplayFixture fixture = new NativeDisplayFixture()) {
            fixture.setViewport(360, 640, 0, false);
            awaitControllerSurface();
            importEmeraldSave();
            chooseMainMenu("Boxes");
            awaitControllerSurface();
            awaitJavaScript("document.querySelector('#box-0-slot-0')?.textContent.includes('ARON')");
            runJavaScript("document.querySelector('#box-0-slot-0').focus()");
            awaitBoxesState(1, "save-file", "box-0", "box-0-slot-0", null);
            assertNativeSafeCanvas("single-pane portrait");

            fixture.setViewport(360, 640, 1, false);
            awaitBoxesState(1, "save-file", "box-0", "box-0-slot-0", null);
            assertNativeSafeCanvas("single-pane landscape");
            pressGamepadKey(KeyEvent.KEYCODE_DPAD_RIGHT, "document.activeElement?.id === 'box-0-slot-1'");
            pressGamepadKey(KeyEvent.KEYCODE_DPAD_LEFT, "document.activeElement?.id === 'box-0-slot-0'");

            fixture.setViewport(360, 640, 0, false);
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_X,
                "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]')"
            );
            runJavaScript("document.querySelector('#box-menu-command-3').click()");
            awaitJavaScript(
                "document.querySelector('[role=dialog][aria-label=\"Open another collection\"]')"
            );
            runJavaScript(
                "[...document.querySelectorAll('[data-source-picker-control]')]"
                    + ".find(control => control.textContent.includes('Pokemon Storage')).click()"
            );
            awaitJavaScript("document.querySelectorAll('.box-pane').length === 2");
            runJavaScript(
                "document.querySelector('[data-source-id=\"pokemon-storage\"] [id$=\"-slot-7\"]').click()"
            );
            awaitJavaScript(
                "document.querySelector('.box-pane.active-pane')?.dataset.sourceId === 'pokemon-storage'"
                    + " && document.activeElement?.id === 'box-0-slot-7'"
            );
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_R1,
                "document.querySelector('.box-pane.active-pane')?.dataset.location === 'box-1'"
                    + " && document.activeElement?.id === 'box-1-slot-7'"
            );
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-7", null);

            fixture.setViewport(360, 408, 0, false);
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-7", null);
            awaitJavaScript(
                "(() => { const panes = [...document.querySelectorAll('.box-pane')]"
                    + ".map(pane => pane.getBoundingClientRect());"
                    + " return panes.length === 2 && panes[1].top >= panes[0].bottom - 1; })()"
            );
            assertNativeSafeCanvas("two-pane square");

            fixture.setViewport(360, 640, 1, false);
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-7", null);
            awaitJavaScript(
                "(() => { const panes = [...document.querySelectorAll('.box-pane')]"
                    + ".map(pane => pane.getBoundingClientRect());"
                    + " return panes.length === 2 && panes[1].left >= panes[0].right - 1; })()"
            );
            assertNativeSafeCanvas("two-pane landscape");

            runJavaScript(
                "document.querySelector('[data-pane-id=\"pane-active-save\"] [id$=\"-slot-0\"]').click()"
            );
            awaitJavaScript("document.activeElement?.id === 'box-0-slot-0'");
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_A,
                "document.querySelector('[role=dialog][aria-label=\"Slot actions\"]')"
            );
            awaitJavaScript(
                "[...document.querySelectorAll('.slot-command-row button')]"
                    + ".some(button => button.textContent.trim() === 'Move')"
            );
            runJavaScript(
                "[...document.querySelectorAll('.slot-command-row button')]"
                    + ".find(button => button.textContent.trim() === 'Move').click()"
            );
            for (int step = 0; step < 6; step++) {
                pressGamepadKey(KeyEvent.KEYCODE_DPAD_RIGHT, null);
            }
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-0", "move ARON");

            fixture.setViewport(360, 408, 0, false);
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-0", "move ARON");
            fixture.setViewport(360, 640, 0, false);
            awaitBoxesState(2, "pokemon-storage", "box-1", "box-1-slot-0", "move ARON");
            assertNativeSafeCanvas("Carry portrait");
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_B,
                "document.querySelector('.carry-at-focus') === null"
                    + " && document.activeElement?.id === 'box-0-slot-0'"
                    + " && document.querySelector('.box-pane.active-pane')?.dataset.sourceId"
                    + " !== 'pokemon-storage'"
            );

            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_X,
                "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]')"
                    + " && document.activeElement?.id === 'box-menu-command-0'"
            );
            fixture.setViewport(360, 640, 1, false);
            awaitJavaScript(
                "document.querySelectorAll('[role=dialog]').length === 1"
                    + " && document.querySelector('[role=dialog][aria-label=\"Box Menu\"]')"
                    + " && document.activeElement?.id === 'box-menu-command-0'"
                    + " && document.querySelectorAll('.box-pane').length === 2"
                    + " && document.querySelector('.box-pane.active-pane')?.dataset.location === 'box-0'"
                    + " && document.querySelector('[data-source-id=\"pokemon-storage\"]')"
                    + "?.dataset.location === 'box-1'"
            );
            assertNativeSafeCanvas("Box Menu landscape");
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_B,
                "document.querySelector('[role=dialog][aria-label=\"Box Menu\"]') === null"
                    + " && document.activeElement?.id === 'box-0-slot-0'"
            );

            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_A,
                "document.querySelector('[role=dialog][aria-label=\"Slot actions\"]')"
            );
            awaitJavaScript("document.querySelector('#slot-action-0')?.textContent.trim() === 'Edit'");
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_A,
                "document.querySelector('.pokemon-editor')"
                    + " && document.activeElement?.id === 'pokemon-editor-section-species-form'"
            );
            runJavaScript("document.querySelector('#pokemon-editor-section-nickname').click()");
            awaitJavaScript(
                "document.querySelector('.pokemon-editor')?.dataset.editorSection === 'nickname'"
                    + " && document.activeElement?.id === 'pokemon-editor-section-nickname'"
                    + " && !document.body.textContent.includes('Quick Actions')"
            );
            fixture.setViewport(360, 408, 0, false);
            awaitPokemonEditorState("pokemon-editor-section-nickname", null);
            fixture.setViewport(360, 640, 0, false);
            awaitPokemonEditorState("pokemon-editor-section-nickname", null);
            assertNativeSafeCanvas("Pokemon Editor portrait");
            pressGamepadKey(
                KeyEvent.KEYCODE_BUTTON_B,
                "document.querySelector('.pokemon-editor') === null"
                    + " && document.querySelector('[role=dialog][aria-label=\"Slot actions\"]')"
                    + " && document.activeElement?.id === 'slot-action-0'"
            );
        }
    }

    @Test
    public void keyboardOpenRotationPreservesTrainerDraftAndTallBand() throws Throwable {
        assumeTrue("Requires Android 11 display controls", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        assertActivityDoesNotLockOrientation();
        try (NativeDisplayFixture fixture = new NativeDisplayFixture()) {
            fixture.setViewport(360, 640, 0, false);
            awaitControllerSurface();
            importEmeraldSave();
            chooseMainMenu("Trainer");
            awaitJavaScript(
                "location.pathname.endsWith('/trainer')"
                    + " && document.querySelector('[data-destination-root=\"trainer\"]')"
                    + "?.dataset.initialState === 'ready'"
                    + " && document.querySelector('[data-destination-focus=\"trainer-name\"]')"
                    + " && innerWidth === 360 && innerHeight === 592"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
            );
            focusAndShowIme("[data-destination-focus=\"trainer-name\"]");
            awaitJavaScript(
                "innerHeight < 560"
                    + " && document.documentElement.dataset.pksxHeightBandLock === 'tall'"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
                    + " && document.activeElement?.dataset.destinationFocus === 'trainer-name'"
            );
            runJavaScript("document.activeElement.select()");
            shellCommand("input text NATIVE");
            awaitJavaScript(
                "document.activeElement?.dataset.destinationFocus === 'trainer-name'"
                    + " && document.activeElement?.value === 'NATIVE'"
            );
            Log.i("PKSXAcceptance", "IME portrait " + nativeAcceptanceState());

            fixture.setViewport(360, 640, 1, true);
            awaitJavaScript(
                "location.pathname.endsWith('/trainer')"
                    + " && innerWidth === 640 && innerHeight < 360"
                    + " && document.activeElement?.dataset.destinationFocus === 'trainer-name'"
                    + " && document.activeElement?.value === 'NATIVE'"
                    + " && document.documentElement.dataset.pksxHeightBandLock === 'tall'"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
            );
            assertFocusedTargetContained("keyboard-open Trainer landscape");
            Log.i("PKSXAcceptance", "IME landscape " + nativeAcceptanceState());

            runJavaScript("document.querySelector('button[aria-label=\"Open Main Menu\"]').focus()");
            hideIme();
            awaitImeHidden();
            awaitJavaScript(
                "document.documentElement.dataset.pksxHeightBandLock === undefined"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'short'"
                    + " && document.querySelector('[data-destination-focus=\"trainer-name\"]')"
                    + "?.value === 'NATIVE'"
            );
            fixture.setViewport(360, 640, 0, false);
            awaitJavaScript(
                "innerWidth === 360 && innerHeight === 592"
                    + " && document.documentElement.dataset.pksxHeightBandLock === undefined"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
                    + " && location.pathname.endsWith('/trainer')"
                    + " && document.querySelector('[data-destination-focus=\"trainer-name\"]')"
                    + "?.value === 'NATIVE'"
            );
            assertNativeSafeCanvas("Trainer portrait after editing");
        }
    }

    @Test
    public void editableFocusKeepsTallHeightBandWhileImeShrinksWebView() throws Throwable {
        assumeTrue("Requires Android 11 display controls", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        awaitImeHidden();
        awaitJavaScript("document.readyState === 'complete' && document.querySelector('.app-shell')");

        String originalRotationMode = userRotation("");
        if (!originalRotationMode.matches("free|lock [0-3]")) {
            fail("Unexpected Android user rotation state: " + originalRotationMode);
        }
        int originalAngle = displayRotation();
        String originalSizeState = shellCommand("wm size");
        if (!originalSizeState.matches("(?s).*Physical size: [0-9]+x[0-9]+.*")) {
            fail("Unexpected Android display size state: " + originalSizeState);
        }
        java.util.regex.Matcher override = java.util.regex.Pattern
            .compile("(?m)^Override size: ([0-9]+x[0-9]+)\\s*$")
            .matcher(originalSizeState);
        String originalSizeOverride = override.find() ? override.group(1) : null;
        Rect originalWindowBounds = windowBounds();
        JSONArray originalViewport = awaitSettledViewport(originalAngle, originalWindowBounds);
        int originalWidth = originalViewport.getInt(0);
        int originalHeight = originalViewport.getInt(1);
        String originalGeometry = nativeWindowGeometry();
        Log.i("PKSXAcceptance", "IME fixture captured geometry " + originalGeometry);
        String fixedRotation = shellCommand("cmd window fixed-to-user-rotation");
        String densityState = shellCommand("wm density");
        String originalDensityOverride = settingOverride(densityState, "Override density");
        String originalStylusHandwriting = shellCommand(
            "settings get secure stylus_handwriting_enabled"
        );
        Log.i(
            "PKSXAcceptance",
            String.format(
                Locale.US,
                "IME fixture captured mode=%s angle=%d sizeOverride=%s viewport=%dx%d fixed=%s density=%s",
                originalRotationMode,
                originalAngle,
                originalSizeOverride == null ? "reset" : originalSizeOverride,
                originalWidth,
                originalHeight,
                fixedRotation,
                densityState.replace('\n', ' ')
            )
        );

        Throwable primaryFailure = null;
        try {
            shellCommand("settings put secure stylus_handwriting_enabled 0");
            shellCommand("wm density 160");
            shellCommand("wm size 540x720");
            userRotation("lock 0");
            awaitDisplayRotation(0);
            awaitImeHidden();
            awaitJavaScript(
                "innerHeight >= 560 && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
            );
            String beforeImeHeight = runJavaScript("innerHeight");

            importEmeraldSave();
            chooseMainMenu("Trainer");
            awaitJavaScript(
                "location.pathname.endsWith('/trainer')"
                    + " && document.querySelector('[data-destination-root=\"trainer\"]')"
                    + "?.dataset.initialState === 'ready'"
                    + " && document.querySelector('[data-destination-focus=\"trainer-name\"]')"
            );
            activityRule
                .getScenario()
                .onActivity(activity -> activity.getBridge().getWebView().requestFocus());
            runJavaScript(
                "(() => { const input = document.querySelector('[data-destination-focus=\"trainer-name\"]');"
                    + " input.focus(); input.click(); return document.activeElement === input; })()"
            );
            activityRule
                .getScenario()
                .onActivity(
                    activity -> {
                        WebView webView = activity.getBridge().getWebView();
                        ((InputMethodManager) activity.getSystemService(MainActivity.INPUT_METHOD_SERVICE))
                            .showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
                    }
                );
            awaitImeVisible();
            awaitJavaScript(
                "innerHeight < 560"
                    + " && document.documentElement.dataset.pksxHeightBandLock === 'tall'"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
                    + " && document.activeElement?.dataset.destinationFocus === 'trainer-name'"
            );
            String withImeHeight = runJavaScript("innerHeight");
            Log.i(
                "PKSXAcceptance",
                "IME fixture measured before=" + beforeImeHeight + " withIme=" + withImeHeight
            );

            runJavaScript("document.querySelector('button[aria-label=\"Open Main Menu\"]').focus()");
            hideIme();
            awaitJavaScript(
                "document.documentElement.dataset.pksxHeightBandLock === undefined"
                    + " && getComputedStyle(document.querySelector('.app-shell'))"
                    + ".getPropertyValue('--pksx-height-band').trim() === 'tall'"
            );
        } catch (Throwable failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            Throwable cleanupFailure = null;
            try {
                try {
                    runJavaScript("document.activeElement?.blur()");
                    hideIme();
                } finally {
                    try {
                        shellCommand(
                            "wm size " + (originalSizeOverride == null ? "reset" : originalSizeOverride)
                        );
                    } finally {
                        try {
                            userRotation("lock " + originalAngle);
                            awaitDisplayRotation(originalAngle);
                            awaitImeHidden();
                            awaitSettledViewport(originalAngle, originalWindowBounds);
                        } finally {
                            userRotation(originalRotationMode);
                            awaitShellState(
                                "cmd window user-rotation",
                                originalRotationMode,
                                "rotation mode"
                            );
                        }
                        awaitDisplayRotation(originalAngle);
                        awaitImeHidden();
                        JSONArray restoredViewport = awaitSettledViewport(originalAngle, originalWindowBounds);
                        String restoredSizeState = shellCommand("wm size");
                        boolean sizeRestored = originalSizeOverride == null
                            ? !restoredSizeState.contains("Override size:")
                            : restoredSizeState.contains("Override size: " + originalSizeOverride);
                        if (!sizeRestored) {
                            fail("Android display size was not restored: " + restoredSizeState);
                        }
                        Log.i(
                            "PKSXAcceptance",
                            "IME fixture restored mode="
                                + userRotation("")
                                + " angle="
                                + displayRotation()
                                + " size="
                                + restoredSizeState.replace('\n', ' ')
                                + " geometry="
                                + nativeWindowGeometry()
                                + " css="
                                + restoredViewport
                        );
                    }
                }
            } catch (Throwable failure) {
                cleanupFailure = new AssertionError(
                    "IME fixture cleanup failed; captured=" + originalGeometry
                        + "; current=" + nativeWindowGeometry(), failure
                );
            }
            try {
                shellCommand(
                    "wm density "
                        + (originalDensityOverride == null ? "reset" : originalDensityOverride)
                );
            } catch (Throwable failure) {
                AssertionError densityFailure = new AssertionError(
                    "IME fixture density cleanup failed",
                    failure
                );
                if (cleanupFailure == null) cleanupFailure = densityFailure;
                else cleanupFailure.addSuppressed(densityFailure);
            }
            try {
                restoreSecureSetting("stylus_handwriting_enabled", originalStylusHandwriting);
            } catch (Throwable failure) {
                AssertionError settingFailure = new AssertionError(
                    "IME fixture secure setting cleanup failed",
                    failure
                );
                if (cleanupFailure == null) cleanupFailure = settingFailure;
                else cleanupFailure.addSuppressed(settingFailure);
            }
            if (cleanupFailure != null) {
                if (primaryFailure == null) throw cleanupFailure;
                primaryFailure.addSuppressed(cleanupFailure);
            }
        }
    }

    private void assertActivityDoesNotLockOrientation() {
        AtomicReference<Integer> requestedOrientation = new AtomicReference<>();
        AtomicReference<Integer> manifestOrientation = new AtomicReference<>();
        activityRule.getScenario().onActivity(activity -> {
            requestedOrientation.set(activity.getRequestedOrientation());
            try {
                manifestOrientation.set(
                    activity
                        .getPackageManager()
                        .getActivityInfo(activity.getComponentName(), 0)
                        .screenOrientation
                );
            } catch (android.content.pm.PackageManager.NameNotFoundException failure) {
                throw new AssertionError(failure);
            }
        });
        if (
            requestedOrientation.get() != ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                || manifestOrientation.get() != ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        ) {
            fail(
                "The shipping activity locks orientation: requested="
                    + requestedOrientation.get()
                    + ", manifest="
                    + manifestOrientation.get()
            );
        }
    }

    private void awaitBoxesState(
        int paneCount,
        String activeSource,
        String activeLocation,
        String activeElementId,
        String carryLabel
    ) throws Exception {
        String sourceExpression = "save-file".equals(activeSource)
            ? "active?.dataset.sourceId !== 'pokemon-storage'"
            : "active?.dataset.sourceId === '" + activeSource + "'";
        String carryExpression = carryLabel == null
            ? "carry === null"
            : "carry?.getAttribute('aria-label')?.toLowerCase() === '" + carryLabel.toLowerCase(Locale.US) + "'";
        awaitJavaScript(
            "(() => { const panes = [...document.querySelectorAll('.box-pane')];"
                + " const active = document.querySelector('.box-pane.active-pane');"
                + " const carry = document.querySelector('.carry-at-focus');"
                + " return location.pathname === '/' && panes.length === "
                + paneCount
                + " && new Set(panes.map(pane => pane.dataset.paneId)).size === panes.length"
                + " && panes[0]?.dataset.paneId === 'pane-active-save'"
                + " && panes[0]?.dataset.location === 'box-0'"
                + (paneCount == 2
                    ? " && panes[1]?.dataset.sourceId === 'pokemon-storage'"
                    + " && panes[1]?.dataset.location === 'box-1'"
                    : "")
                + " && "
                + sourceExpression
                + " && active?.dataset.location === '"
                + activeLocation
                + "' && document.activeElement?.id === '"
                + activeElementId
                + "' && "
                + carryExpression
                + "; })()"
        );
    }

    private void awaitPokemonEditorState(String activeElementId, String inputValue) throws Exception {
        awaitJavaScript(
            "(() => { const editor = document.querySelector('.pokemon-editor');"
                + " const panes = [...document.querySelectorAll('.box-pane')];"
                + " return location.pathname === '/' && document.querySelectorAll('[role=dialog]').length === 1"
                + " && editor?.dataset.editorSection === 'nickname'"
                + " && panes.length === 2 && panes[0]?.dataset.location === 'box-0'"
                + " && panes[1]?.dataset.sourceId === 'pokemon-storage'"
                + " && panes[1]?.dataset.location === 'box-1'"
                + " && document.activeElement?.id === '"
                + activeElementId
                + "'"
                + (inputValue == null
                    ? ""
                    : " && document.querySelector('#pokemon-editor-nickname')?.value === '"
                    + inputValue
                    + "'")
                + " && !document.body.textContent.includes('Quick Actions'); })()"
        );
    }

    private void focusAndShowIme(String selector) throws Exception {
        activityRule
            .getScenario()
            .onActivity(activity -> activity.getBridge().getWebView().requestFocus());
        runJavaScript(
            "(() => { const input = document.querySelector('"
                + selector
                + "'); input.focus(); input.click(); return document.activeElement === input; })()"
        );
        activityRule
            .getScenario()
            .onActivity(activity -> {
                WebView webView = activity.getBridge().getWebView();
                ((InputMethodManager) activity.getSystemService(MainActivity.INPUT_METHOD_SERVICE))
                    .showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
            });
        awaitImeVisible();
    }

    private void assertFocusedTargetContained(String label) throws Exception {
        String contained = runJavaScript(
            "(() => { const target = document.activeElement; const viewport = visualViewport;"
                + " if (!(target instanceof HTMLElement) || !viewport) return false;"
                + " const rect = target.getBoundingClientRect();"
                + " return rect.left >= viewport.offsetLeft - 1 && rect.top >= viewport.offsetTop - 1"
                + " && rect.right <= viewport.offsetLeft + viewport.width + 1"
                + " && rect.bottom <= viewport.offsetTop + viewport.height + 1; })()"
        );
        if (!"true".equals(contained)) {
            fail(label + " focused target is obscured: " + nativeAcceptanceState());
        }
    }

    private void assertNativeSafeCanvas(String label) throws Exception {
        JSONObject geometry = new JSONObject(
            runJavaScript(
                "(() => { const dialogs = [...document.querySelectorAll('[role=dialog]')]"
                    + ".filter(node => node.getClientRects().length > 0);"
                    + " const surface = dialogs.at(-1) ?? document.querySelector('[data-destination-root]');"
                    + " const target = document.activeElement;"
                    + " const scrollport = target?.closest('.location-grid,.edge-menu-panel,.editor-rail,'"
                    + " + '.editor-content,[data-testid$=\"-scrollport\"]') ?? surface;"
                    + " const rect = node => { const value = node?.getBoundingClientRect();"
                    + " return value ? [value.left,value.top,value.right,value.bottom] : null; };"
                    + " const root = getComputedStyle(document.documentElement);"
                    + " return {innerWidth,innerHeight,safe:["
                    + " '--pksx-safe-area-top','--pksx-safe-area-right',"
                    + " '--pksx-safe-area-bottom','--pksx-safe-area-left'"
                    + " ].map(name => parseFloat(root.getPropertyValue(name))),"
                    + " surface:rect(surface),target:rect(target),scrollport:rect(scrollport)}; })()"
            )
        );
        JSONArray safe = geometry.getJSONArray("safe");
        for (int index = 0; index < safe.length(); index++) {
            if (!Double.isFinite(safe.getDouble(index)) || safe.getDouble(index) < 0) {
                fail(label + " has invalid CSS safe-area aliases: " + geometry);
            }
        }

        AtomicReference<String> evidence = new AtomicReference<>();
        AtomicReference<Boolean> contained = new AtomicReference<>(false);
        activityRule.getScenario().onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            android.view.View decor = activity.getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            int[] webViewOrigin = new int[2];
            int[] decorOrigin = new int[2];
            webView.getLocationOnScreen(webViewOrigin);
            decor.getLocationOnScreen(decorOrigin);
            Rect decorBounds = new Rect(
                decorOrigin[0],
                decorOrigin[1],
                decorOrigin[0] + decor.getWidth(),
                decorOrigin[1] + decor.getHeight()
            );
            Rect webViewBounds = new Rect(
                webViewOrigin[0],
                webViewOrigin[1],
                webViewOrigin[0] + webView.getWidth(),
                webViewOrigin[1] + webView.getHeight()
            );
            Insets bars = insets == null
                ? Insets.NONE
                : insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
            Rect safeBounds = new Rect(
                decorBounds.left + bars.left,
                decorBounds.top + bars.top,
                decorBounds.right - bars.right,
                decorBounds.bottom - bars.bottom
            );
            double scaleX = webView.getWidth() / geometry.optDouble("innerWidth", 0);
            double scaleY = webView.getHeight() / geometry.optDouble("innerHeight", 0);
            RectF surface = screenBounds(
                webViewOrigin,
                scaleX,
                scaleY,
                jsonBounds(geometry.optJSONArray("surface"))
            );
            RectF target = screenBounds(
                webViewOrigin,
                scaleX,
                scaleY,
                jsonBounds(geometry.optJSONArray("target"))
            );
            double[] scrollportBounds = jsonBounds(geometry.optJSONArray("scrollport"));
            RectF scrollport = screenBounds(webViewOrigin, scaleX, scaleY, scrollportBounds);
            contained.set(
                webViewBounds.contains(safeBounds)
                    && contains(safeBounds, surface)
                    && contains(scrollport, target)
            );
            evidence.set(
                "decor=" + decorBounds + " webView=" + webViewBounds + " bars=" + bars
                    + " safe=" + safeBounds + " surface=" + surface + " target=" + target
                    + " scrollport=" + scrollport + " css=" + geometry
            );
        });
        Log.i("PKSXAcceptance", label + " " + evidence.get());
        if (!contained.get()) fail(label + " Safe Canvas containment failed: " + evidence.get());
    }

    private double[] jsonBounds(JSONArray bounds) {
        if (bounds == null || bounds.length() != 4) return new double[] { 0, 0, 0, 0 };
        return new double[] {
            bounds.optDouble(0),
            bounds.optDouble(1),
            bounds.optDouble(2),
            bounds.optDouble(3)
        };
    }

    private final class NativeDisplayFixture implements AutoCloseable {
        private final String originalSizeOverride;
        private final String originalDensityOverride;
        private final String originalFixedRotation;
        private final String originalRotationMode;
        private final String originalStylusHandwriting;
        private final int originalAngle;
        private final Rect originalWindowBounds;
        private final String originalGeometry;

        NativeDisplayFixture() throws Exception {
            awaitImeHidden();
            originalSizeOverride = settingOverride(shellCommand("wm size"), "Override size");
            originalDensityOverride = settingOverride(shellCommand("wm density"), "Override density");
            originalFixedRotation = shellCommand("cmd window fixed-to-user-rotation");
            originalRotationMode = userRotation("");
            if (!originalRotationMode.matches("free|lock [0-3]")) {
                fail("Unexpected Android user rotation state: " + originalRotationMode);
            }
            originalStylusHandwriting = shellCommand(
                "settings get secure stylus_handwriting_enabled"
            );
            originalAngle = displayRotation();
            originalWindowBounds = windowBounds();
            originalGeometry = nativeWindowGeometry();
            Log.i("PKSXAcceptance", "Native fixture captured " + originalGeometry);
            shellCommand("settings put secure stylus_handwriting_enabled 0");
        }

        void setViewport(int naturalWidth, int naturalHeight, int rotation, boolean imeVisible)
            throws Exception {
            shellCommand("cmd window fixed-to-user-rotation enabled");
            shellCommand("wm density 160");
            shellCommand("wm size " + naturalWidth + "x" + naturalHeight);
            userRotation("lock " + rotation);
            awaitDisplayRotation(rotation);
            if (imeVisible) awaitImeVisible();
            else awaitImeHidden();
            int width = rotation % 2 == 0 ? naturalWidth : naturalHeight;
            int height = rotation % 2 == 0 ? naturalHeight : naturalWidth;
            Rect expectedBounds = new Rect(0, 0, width, height);
            awaitWindowBounds(expectedBounds);
            JSONArray viewport = awaitSettledViewport(rotation, expectedBounds, imeVisible);
            if (viewport.getInt(0) != width || viewport.getInt(1) != webViewHeight()) {
                fail(
                    "Unexpected CSS viewport at " + width + "x" + height + ": " + viewport
                        + ", " + nativeWindowGeometry()
                );
            }
            Log.i(
                "PKSXAcceptance",
                "Native viewport " + width + "x" + height + " ime=" + imeVisible + " "
                    + nativeAcceptanceState()
            );
        }

        @Override
        public void close() throws Exception {
            runJavaScript("document.activeElement?.blur()");
            hideIme();
            awaitImeHidden();
            shellCommand("wm size " + (originalSizeOverride == null ? "reset" : originalSizeOverride));
            shellCommand(
                "wm density " + (originalDensityOverride == null ? "reset" : originalDensityOverride)
            );
            shellCommand("cmd window fixed-to-user-rotation enabled");
            userRotation("lock " + originalAngle);
            awaitDisplayRotation(originalAngle);
            awaitWindowBounds(originalWindowBounds);
            shellCommand("cmd window fixed-to-user-rotation " + originalFixedRotation);
            userRotation(originalRotationMode);
            restoreSecureSetting("stylus_handwriting_enabled", originalStylusHandwriting);
            awaitShellState("cmd window user-rotation", originalRotationMode, "rotation mode");
            awaitShellState(
                "cmd window fixed-to-user-rotation",
                originalFixedRotation,
                "fixed-rotation policy"
            );
            Log.i(
                "PKSXAcceptance",
                "Native fixture restored captured=" + originalGeometry + " current="
                    + nativeWindowGeometry()
            );
        }
    }

    private String settingOverride(String state, String label) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("(?m)^" + label + ": ([^\\s]+)\\s*$")
            .matcher(state);
        return matcher.find() ? matcher.group(1) : null;
    }

    private void awaitShellState(String command, String expected, String label) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        String actual = null;
        while (SystemClock.uptimeMillis() < deadline) {
            actual = shellCommand(command);
            if (expected.equals(actual)) return;
            SystemClock.sleep(50);
        }
        fail(
            "Android " + label + " was not restored: expected=" + expected + ", actual="
                + actual + ", " + nativeWindowGeometry()
        );
    }

    private void awaitWindowBounds(Rect expected) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        Rect actual = null;
        while (SystemClock.uptimeMillis() < deadline) {
            actual = windowBounds();
            if (expected.equals(actual)) return;
            SystemClock.sleep(50);
        }
        fail(
            "Timed out waiting for Android window " + expected + ", actual=" + actual + ", "
                + nativeWindowGeometry()
        );
    }

    private int webViewHeight() {
        AtomicReference<Integer> height = new AtomicReference<>();
        activityRule.getScenario().onActivity(
            activity -> height.set(activity.getBridge().getWebView().getHeight())
        );
        return height.get();
    }

    private JSONArray awaitSettledViewport(int expectedRotation, Rect expectedWindowBounds) throws Exception {
        return awaitSettledViewport(expectedRotation, expectedWindowBounds, false);
    }

    private JSONArray awaitSettledViewport(
        int expectedRotation,
        Rect expectedWindowBounds,
        boolean imeVisible
    ) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        String lastState = "no observation";
        while (SystemClock.uptimeMillis() < deadline) {
            int[] firstNative = readyNativeViewport(expectedWindowBounds, imeVisible);
            JSONArray firstCss = firstNative == null ? null : viewportMetrics();
            int[] firstAfter = readyNativeViewport(expectedWindowBounds, imeVisible);
            if (!awaitNextVisualState(deadline)) break;
            int[] secondNative = readyNativeViewport(expectedWindowBounds, imeVisible);
            JSONArray secondCss = secondNative == null ? null : viewportMetrics();
            int[] secondAfter = readyNativeViewport(expectedWindowBounds, imeVisible);

            lastState =
                "native="
                    + java.util.Arrays.toString(firstNative)
                    + "/"
                    + java.util.Arrays.toString(firstAfter)
                    + "/"
                    + java.util.Arrays.toString(secondNative)
                    + "/"
                    + java.util.Arrays.toString(secondAfter)
                    + ", css="
                    + firstCss
                    + "/"
                    + secondCss;
            if (
                firstNative != null
                    && firstNative[0] == expectedRotation
                    && java.util.Arrays.equals(firstNative, firstAfter)
                    && java.util.Arrays.equals(firstNative, secondNative)
                    && java.util.Arrays.equals(firstNative, secondAfter)
                    && matchesNativeViewport(firstCss, firstNative)
                    && matchesNativeViewport(secondCss, firstNative)
            ) return secondCss;
        }
        fail("Timed out waiting for Android window " + expectedWindowBounds + ": "
            + lastState + ", " + nativeWindowGeometry());
        return null;
    }

    private String nativeWindowGeometry() {
        AtomicReference<String> state = new AtomicReference<>();
        try {
            activityRule.getScenario().onActivity(activity -> {
                try {
                    com.getcapacitor.Bridge bridge = activity.getBridge();
                    WebView webView = bridge == null ? null : bridge.getWebView();
                    android.view.Display display = webView == null ? null : webView.getDisplay();
                    if (webView == null || display == null || !(webView.getParent() instanceof android.view.View)) {
                        state.set("unavailable(detached WebView)");
                        return;
                    }
                    android.view.View parent = (android.view.View) webView.getParent();
                    android.view.View decor = activity.getWindow().getDecorView();
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
                    int[] position = new int[2];
                    webView.getLocationOnScreen(position);
                    state.set("rotation=" + display.getRotation()
                        + " density=" + activity.getResources().getDisplayMetrics().densityDpi
                        + " decor=" + decor.getWidth() + "x" + decor.getHeight()
                        + " parent=" + parent.getWidth() + "x" + parent.getHeight()
                        + " padding=" + parent.getPaddingLeft() + "," + parent.getPaddingTop()
                        + "," + parent.getPaddingRight() + "," + parent.getPaddingBottom()
                        + " webView=" + webView.getWidth() + "x" + webView.getHeight()
                        + "@" + position[0] + "," + position[1]
                        + " status=" + (insets == null ? null : insets.getInsets(WindowInsetsCompat.Type.statusBars()))
                        + " navigation=" + (insets == null ? null : insets.getInsets(WindowInsetsCompat.Type.navigationBars()))
                        + " cutout=" + (insets == null ? null : insets.getInsets(WindowInsetsCompat.Type.displayCutout()))
                        + " ime=" + (insets == null ? null : insets.getInsets(WindowInsetsCompat.Type.ime()))
                        + " imeVisible=" + (insets == null ? null : insets.isVisible(WindowInsetsCompat.Type.ime())));
                } catch (RuntimeException failure) {
                    state.set("unavailable(" + failure.getClass().getSimpleName() + ")");
                }
            });
        } catch (RuntimeException failure) {
            return "unavailable(" + failure.getClass().getSimpleName() + ")";
        }
        return state.get();
    }

    private Rect windowBounds() {
        AtomicReference<Rect> bounds = new AtomicReference<>();
        activityRule.getScenario().onActivity(activity -> bounds.set(
            new Rect(activity.getWindowManager().getCurrentWindowMetrics().getBounds())
        ));
        return bounds.get();
    }

    private int[] readyNativeViewport(Rect expectedWindowBounds, boolean imeVisible) {
        AtomicReference<int[]> viewport = new AtomicReference<>();
        activityRule
            .getScenario()
            .onActivity(
                activity -> {
                    WebView webView = activity.getBridge().getWebView();
                    android.view.View parent = (android.view.View) webView.getParent();
                    android.view.View decor = activity.getWindow().getDecorView();
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
                    if (
                        webView.getDisplay() != null
                            && parent != null
                            && webView.isAttachedToWindow()
                            && webView.isLaidOut()
                            && webView.getWidth() > 0
                            && webView.getHeight() > 0
                            && !webView.isLayoutRequested()
                            && !parent.isLayoutRequested()
                            && insets != null
                            && insets.isVisible(WindowInsetsCompat.Type.ime()) == imeVisible
                    ) {
                        int[] origin = new int[2];
                        decor.getLocationOnScreen(origin);
                        Rect decorBounds = new Rect(origin[0], origin[1],
                            origin[0] + decor.getWidth(), origin[1] + decor.getHeight());
                        if (!expectedWindowBounds.equals(decorBounds)) return;
                        webView.getLocationOnScreen(origin);
                        Rect webViewBounds = new Rect(origin[0], origin[1],
                            origin[0] + webView.getWidth(), origin[1] + webView.getHeight());
                        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
                        Rect safeBounds = new Rect(decorBounds.left + bars.left,
                            decorBounds.top + bars.top, decorBounds.right - bars.right,
                            decorBounds.bottom - bars.bottom);
                        if (
                            !decorBounds.contains(webViewBounds)
                                || (!imeVisible && !webViewBounds.contains(safeBounds))
                        ) return;
                        viewport.set(
                            new int[] {
                                webView.getDisplay().getRotation(),
                                webView.getWidth(),
                                webView.getHeight(),
                                webViewBounds.left,
                                webViewBounds.top,
                            }
                        );
                    }
                }
            );
        return viewport.get();
    }

    private JSONArray viewportMetrics() throws Exception {
        return new JSONArray(
            runJavaScript("[innerWidth,innerHeight,devicePixelRatio,visualViewport?.scale]")
        );
    }

    private boolean matchesNativeViewport(JSONArray css, int[] nativeViewport) throws Exception {
        return css != null
            && css.getInt(0) == nativeViewport[1]
            && css.getInt(1) == nativeViewport[2]
            && css.getDouble(2) == 1d
            && css.getDouble(3) == 1d;
    }

    private boolean awaitNextVisualState(long deadline) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        activityRule
            .getScenario()
            .onActivity(
                activity ->
                    activity
                        .getBridge()
                        .getWebView()
                        .postVisualStateCallback(
                            SystemClock.uptimeMillis(),
                            new WebView.VisualStateCallback() {
                                @Override
                                public void onComplete(long requestId) {
                                    latch.countDown();
                                }
                            }
                        )
            );
        long remaining = deadline - SystemClock.uptimeMillis();
        return remaining > 0 && latch.await(remaining, TimeUnit.MILLISECONDS);
    }

    private void awaitControllerSurface() throws Exception {
        awaitJavaScript(
            "document.readyState === 'complete'"
                + " && document.querySelector('.main-menu-opener')"
                + " && ((document.querySelector('.boxes-route')?.dataset.initialState === 'ready'"
                + " && document.querySelector('#box-grid')?.getClientRects().length > 0)"
                + " || (document.querySelector('[data-destination-root]')?.dataset.destinationRoot !== 'boxes'"
                + " && document.querySelector('[data-destination-root]')?.dataset.initialState === 'ready'))"
        );
        if (!"true".equals(runJavaScript("Boolean(document.querySelector('#box-grid'))"))) {
            chooseMainMenu("Boxes");
        }
        awaitJavaScript(
            "document.readyState === 'complete'"
                + " && document.querySelector('.boxes-route')?.dataset.initialState === 'ready'"
                + " && document.querySelector('#box-grid')?.getClientRects().length > 0"
        );
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        SystemClock.sleep(500);
    }

    private void chooseMainMenu(String label) throws Exception {
        runJavaScript("document.querySelector('.main-menu-opener').click()");
        awaitJavaScript("document.querySelector('[role=dialog][aria-label=\"Main Menu\"]')");
        runJavaScript(
            "[...document.querySelectorAll('.main-menu-row button')]"
                + ".find(button => button.querySelector('strong')?.textContent === '"
                + label
                + "').click()"
        );
    }

    private void awaitImeVisible() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<Boolean> visible = new AtomicReference<>(false);
            activityRule
                .getScenario()
                .onActivity(
                    activity -> {
                        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(
                            activity.getBridge().getWebView()
                        );
                        visible.set(
                            insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())
                        );
                    }
                );
            if (visible.get()) return;
            SystemClock.sleep(50);
        }
        fail("Timed out waiting for the Android IME to become visible");
    }

    private void restoreSecureSetting(String key, String value) throws Exception {
        if ("null".equals(value)) shellCommand("settings delete secure " + key);
        else shellCommand("settings put secure " + key + " " + value);
        if (!value.equals(shellCommand("settings get secure " + key))) {
            fail("Android secure setting was not restored: " + key);
        }
    }

    private void awaitImeHidden() throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<Boolean> hidden = new AtomicReference<>(false);
            activityRule
                .getScenario()
                .onActivity(
                    activity -> {
                        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(
                            activity.getBridge().getWebView()
                        );
                        hidden.set(insets != null && !insets.isVisible(WindowInsetsCompat.Type.ime()));
                    }
                );
            if (hidden.get()) return;
            SystemClock.sleep(50);
        }
        fail("Timed out waiting for the Android IME to become hidden");
    }

    private void hideIme() {
        activityRule
            .getScenario()
            .onActivity(
                activity ->
                    ((InputMethodManager) activity.getSystemService(MainActivity.INPUT_METHOD_SERVICE))
                        .hideSoftInputFromWindow(activity.getBridge().getWebView().getWindowToken(), 0)
            );
    }

    private int displayRotation() {
        AtomicReference<Integer> rotation = new AtomicReference<>();
        activityRule
            .getScenario()
            .onActivity(
                activity -> rotation.set(
                    activity.getBridge().getWebView().getDisplay().getRotation()
                )
            );
        return rotation.get();
    }

    private void awaitDisplayRotation(int expected) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS);
        while (SystemClock.uptimeMillis() < deadline) {
            if (displayRotation() == expected) return;
            SystemClock.sleep(50);
        }
        fail("Timed out waiting for Android display rotation " + expected);
    }

    private String userRotation(String arguments) throws Exception {
        return shellCommand("cmd window user-rotation " + arguments);
    }

    private String shellCommand(String command) throws Exception {
        try (
            InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(
                InstrumentationRegistry
                    .getInstrumentation()
                    .getUiAutomation()
                    .executeShellCommand(command)
            )
        ) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[256];
            for (int count; (count = output.read(buffer)) != -1; ) bytes.write(buffer, 0, count);
            return bytes.toString("UTF-8").trim();
        }
    }

    private RectF screenBounds(int[] origin, double scaleX, double scaleY, double[] cssBounds) {
        return new RectF(
            (float) (origin[0] + cssBounds[0] * scaleX),
            (float) (origin[1] + cssBounds[1] * scaleY),
            (float) (origin[0] + cssBounds[2] * scaleX),
            (float) (origin[1] + cssBounds[3] * scaleY)
        );
    }

    private boolean contains(Rect outer, RectF inner) {
        return inner.left >= outer.left - 1 &&
        inner.top >= outer.top - 1 &&
        inner.right <= outer.right + 1 &&
        inner.bottom <= outer.bottom + 1;
    }

    private boolean contains(RectF outer, RectF inner) {
        return inner.left >= outer.left - 1 &&
        inner.top >= outer.top - 1 &&
        inner.right <= outer.right + 1 &&
        inner.bottom <= outer.bottom + 1;
    }

    private void pressGamepadKey(int keyCode, String expectedState) throws Exception {
        long downTime = SystemClock.uptimeMillis();
        activityRule.getScenario().onActivity(activity -> {
            activity.dispatchKeyEvent(gamepadKeyEvent(KeyEvent.ACTION_DOWN, keyCode, 0, downTime));
            activity.dispatchKeyEvent(gamepadKeyEvent(KeyEvent.ACTION_UP, keyCode, 0, downTime));
        });
        if (expectedState != null) awaitJavaScript(expectedState);
        runJavaScript("true");
    }

    private void dispatchGamepadKey(int action, int keyCode, int repeatCount, long downTime) {
        dispatchKeyEvent(gamepadKeyEvent(action, keyCode, repeatCount, downTime));
    }

    private KeyEvent gamepadKeyEvent(int action, int keyCode, int repeatCount, long downTime) {
        return new KeyEvent(
            downTime,
            SystemClock.uptimeMillis(),
            action,
            keyCode,
            repeatCount,
            0,
            KeyCharacterMap.VIRTUAL_KEYBOARD,
            0,
            0,
            InputDevice.SOURCE_GAMEPAD
        );
    }

    private void pressPlatformBack() {
        activityRule
            .getScenario()
            .onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
    }

    private void awaitControllerHighlight(String id) throws Exception {
        awaitJavaScript(controllerHighlightExpression(id));
    }

    private String controllerHighlightExpression(String id) {
        return "document.activeElement?.id === '"
            + id
            + "' && getComputedStyle(document.activeElement).outlineStyle === 'solid'"
            + " && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3";
    }

    private void assertAllFocusableControlsHighlighted(String scope) throws Exception {
        String selector =
            "button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]):not([type=file]),"
                + "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])";
        awaitJavaScript(
            "(() => { const root = document.querySelector('"
                + scope
                + "'); if (!root) return false; const controls = [...root.querySelectorAll('"
                + selector
                + "')].filter(control => { const rect = control.getBoundingClientRect();"
                + " const style = getComputedStyle(control); return rect.width > 0 && rect.height > 0"
                + " && style.display !== 'none' && style.visibility !== 'hidden'; });"
                + " return controls.length > 0 && controls.every(control => { control.focus();"
                + " const style = getComputedStyle(control); return style.outlineStyle === 'solid'"
                + " && parseFloat(style.outlineWidth) >= 3; }); })()"
        );
    }

    private void importEmeraldSave() throws Exception {
        chooseMainMenu("Saves");
        awaitJavaScript(
            "location.pathname.endsWith('/saves') && document.querySelector('#save-file-input')"
        );
        String encoded = Base64.encodeToString(readAsset("emerald-011020251345.sav"), Base64.NO_WRAP);
        runJavaScript(
            "(() => { const bytes = Uint8Array.from(atob('"
                + encoded
                + "'), value => value.charCodeAt(0)); const transfer = new DataTransfer();"
                + " transfer.items.add(new File([bytes], 'emerald.sav'));"
                + " const input = document.querySelector('#save-file-input'); input.files = transfer.files;"
                + " input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()"
        );
        awaitJavaScript(
            "document.body.textContent.includes('emerald.sav imported and made active.')",
            ENGINE_TIMEOUT_SECONDS
        );
    }

    private byte[] readAsset(String name) throws Exception {
        try (
            InputStream input = InstrumentationRegistry
                .getInstrumentation()
                .getContext()
                .getAssets()
                .open(name);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }

    private void dispatchKeyEvent(KeyEvent event) {
        activityRule.getScenario().onActivity(activity -> activity.dispatchKeyEvent(event));
    }

    private void moveJoystick(float x, float y, String expectedState) throws Exception {
        dispatchJoystickMotion(x, y);
        awaitJavaScript(expectedState);
        dispatchJoystickMotion(0f, 0f);
        runJavaScript("true");
    }

    private void dispatchJoystickMotion(float x, float y) {
        MotionEvent.PointerProperties properties = new MotionEvent.PointerProperties();
        properties.id = 0;
        properties.toolType = MotionEvent.TOOL_TYPE_UNKNOWN;

        MotionEvent.PointerCoords coordinates = new MotionEvent.PointerCoords();
        coordinates.setAxisValue(MotionEvent.AXIS_X, x);
        coordinates.setAxisValue(MotionEvent.AXIS_Y, y);

        long eventTime = SystemClock.uptimeMillis();
        MotionEvent event =
            MotionEvent.obtain(
                eventTime,
                eventTime,
                MotionEvent.ACTION_MOVE,
                1,
                new MotionEvent.PointerProperties[] { properties },
                new MotionEvent.PointerCoords[] { coordinates },
                0,
                0,
                1f,
                1f,
                0,
                0,
                InputDevice.SOURCE_JOYSTICK,
                0
            );
        activityRule
            .getScenario()
            .onActivity(activity -> activity.dispatchGenericMotionEvent(event));
        event.recycle();
    }

    private String nativeAcceptanceState() throws Exception {
        return runJavaScript(
            "(() => { const panes = [...document.querySelectorAll('.box-pane')].map(pane => ({"
                + " id:pane.dataset.paneId,source:pane.dataset.sourceId,location:pane.dataset.location,"
                + " active:pane.classList.contains('active-pane')}));"
                + " const dialogs = [...document.querySelectorAll('[role=dialog]')]"
                + ".filter(node => node.getClientRects().length > 0);"
                + " const active = document.activeElement; const root = getComputedStyle(document.documentElement);"
                + " return {path:location.pathname,innerWidth,innerHeight,"
                + " visualViewport:visualViewport ? {width:visualViewport.width,height:visualViewport.height,"
                + " offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop} : null,"
                + " activeId:active?.id ?? null,activeFocus:active?.dataset.destinationFocus ?? null,"
                + " activeValue:'value' in (active ?? {}) ? active.value : null,panes,"
                + " controllerEvents:window.__pksxTestControllerEvents ?? null,"
                + " appVersion:document.querySelector('[data-testid=\"app-version\"]')?.textContent ?? null,"
                + " appPlatform:document.querySelector('[data-testid=\"app-platform\"]')?.textContent ?? null,"
                + " settingsDocument:window.__pksxSettingsDocument ?? null,"
                + " carry:document.querySelector('.carry-at-focus')?.getAttribute('aria-label') ?? null,"
                + " dialog:dialogs.at(-1)?.getAttribute('aria-label')"
                + " ?? dialogs.at(-1)?.querySelector('h1,h2')?.textContent?.trim() ?? null,"
                + " editorSection:document.querySelector('.pokemon-editor')?.dataset.editorSection ?? null,"
                + " heightBand:root.getPropertyValue('--pksx-height-band').trim(),"
                + " heightBandLock:document.documentElement.dataset.pksxHeightBandLock ?? null,"
                + " safe:['top','right','bottom','left'].map(side =>"
                + " root.getPropertyValue('--pksx-safe-area-' + side).trim())}; })()"
        );
    }

    private void awaitJavaScript(String expression) throws Exception {
        awaitJavaScript(expression, TIMEOUT_SECONDS);
    }

    private void awaitJavaScript(String expression, long timeoutSeconds) throws Exception {
        long deadline = SystemClock.uptimeMillis() + TimeUnit.SECONDS.toMillis(timeoutSeconds);
        String result = null;

        while (SystemClock.uptimeMillis() < deadline) {
            result = runJavaScript("Boolean(" + expression + ")");
            if ("true".equals(result)) return;
            SystemClock.sleep(50);
        }

        String state = nativeAcceptanceState();
        fail(
            "Timed out waiting for JavaScript: "
                + expression
                + ", last result: "
                + result
                + ", state: "
                + state
                + ", native: "
                + nativeWindowGeometry()
        );
    }

    private String runJavaScript(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();

        activityRule
            .getScenario()
            .onActivity(
                activity ->
                    activity
                        .getBridge()
                        .getWebView()
                        .evaluateJavascript(
                            script,
                            value -> {
                                result.set(value);
                                latch.countDown();
                            }
                        )
            );

        if (!latch.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            fail("Timed out evaluating JavaScript: " + script);
        }
        return result.get();
    }
}
