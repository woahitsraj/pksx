# Android testing

PKSX uses an API 36 emulator for native controller acceptance tests. The test sends
controller-sourced Android key and joystick events into `MainActivity`, then verifies
Controller Focus and visible WebView state.

## One-time setup on Apple silicon

Android Studio and JDK 21 must be installed. Accept the Android SDK licenses yourself:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  "$HOME/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager" --licenses
```

Install the API 36 platform and ARM emulator image:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  "$HOME/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager" \
  "platforms;android-36" \
  "system-images;android-36;google_apis;arm64-v8a"
```

Create the test AVD:

```sh
echo no | "$HOME/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager" \
  create avd \
  --force \
  --name pksx-api-36 \
  --package "system-images;android-36;google_apis;arm64-v8a" \
  --device pixel_2
```

Set JDK 21 for the current shell:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

## Run

Build a debug APK:

```sh
pnpm android:build
```

Run the controller, software-keyboard, and rotation acceptance tests:

```sh
pnpm test:android
```

The test command starts `pksx-api-36` headlessly when no emulator is running, runs the
instrumentation suite, and shuts down only the emulator it started. Set `ANDROID_SERIAL`
to target a specific connected device. The native fixture captures and restores the target's
display size, density, rotation policy, angle, and handwriting setting.

The suite verifies the 360 by 640 portrait and 640 by 360 landscape endpoints at density 160.
It opens the real Android software keyboard, checks the Tall Height Band lock while the WebView
shrinks below 560 CSS pixels, and rotates Boxes, Carry, Menus, the Pokemon Editor, and active
Trainer editing. CI runs the same state and geometry assertions on an API 36 Pixel 2 x86_64
emulator. Failures report the destination, pane and Location identities, Controller Focus, Carry,
open workflow, Height Band, viewport, WebView, insets, and relevant rectangles.
