package com.pksx.app;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final float AXIS_THRESHOLD = 0.55f;
    private static final String[] DIRECTIONS = {
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
    };

    private final Set<String> motionDirections = new HashSet<>();
    private final Set<String> dispatchedDirections = new HashSet<>();

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!isController(event.getSource())) return super.dispatchKeyEvent(event);

        String key = controllerKey(event.getKeyCode());
        if (key == null) return super.dispatchKeyEvent(event);

        boolean pressed = event.getAction() == KeyEvent.ACTION_DOWN;
        dispatchControllerInput(key, pressed, true);
        return true;
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (!isController(event.getSource())) return super.dispatchGenericMotionEvent(event);

        motionDirections.clear();
        if (event.getActionMasked() != MotionEvent.ACTION_CANCEL) {
            float x = event.getAxisValue(MotionEvent.AXIS_HAT_X);
            float y = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
            if (Math.abs(x) < AXIS_THRESHOLD) x = event.getAxisValue(MotionEvent.AXIS_X);
            if (Math.abs(y) < AXIS_THRESHOLD) y = event.getAxisValue(MotionEvent.AXIS_Y);

            if (x < -AXIS_THRESHOLD) motionDirections.add("ArrowLeft");
            if (x > AXIS_THRESHOLD) motionDirections.add("ArrowRight");
            if (y < -AXIS_THRESHOLD) motionDirections.add("ArrowUp");
            if (y > AXIS_THRESHOLD) motionDirections.add("ArrowDown");
        }
        dispatchDirectionChanges();
        return true;
    }

    private void dispatchDirectionChanges() {
        for (String direction : Arrays.asList(DIRECTIONS)) {
            boolean pressed = motionDirections.contains(direction);
            if (pressed == dispatchedDirections.contains(direction)) continue;

            if (pressed) dispatchedDirections.add(direction);
            else dispatchedDirections.remove(direction);
            dispatchControllerInput(direction, pressed, false);
        }
    }

    private void dispatchControllerInput(String key, boolean pressed, boolean discrete) {
        if (getBridge() == null || getBridge().getWebView() == null) return;

        String script =
            "window.dispatchEvent(new CustomEvent('pksxcontroller',{detail:{key:'"
                + key
                + "',pressed:"
                + pressed
                + ",discrete:"
                + discrete
                + ",id:'Android controller'}}));";
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    private static boolean isController(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
            || (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private static String controllerKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return "ArrowRight";
            case KeyEvent.KEYCODE_BUTTON_A:
                return "Enter";
            case KeyEvent.KEYCODE_BUTTON_B:
                return "Escape";
            case KeyEvent.KEYCODE_BUTTON_X:
                return "x";
            case KeyEvent.KEYCODE_BUTTON_Y:
                return "y";
            case KeyEvent.KEYCODE_BUTTON_L1:
                return "PageUp";
            case KeyEvent.KEYCODE_BUTTON_R1:
                return "PageDown";
            default:
                return null;
        }
    }
}
