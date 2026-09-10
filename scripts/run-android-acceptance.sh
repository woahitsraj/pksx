#!/usr/bin/env bash
set -euo pipefail

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME="$sdk_root"
adb_bin="$sdk_root/platform-tools/adb"
emulator_bin="$sdk_root/emulator/emulator"
avd_name="${PKSX_ANDROID_AVD:-pksx-api-36}"
started_emulator=false
emulator_log=""

if [[ "$(uname)" == "Darwin" ]] && [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
	export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi

cleanup() {
	if $started_emulator; then
		"$adb_bin" -s "$serial" emu kill >/dev/null 2>&1 || true
	fi
	[[ -z "$emulator_log" ]] || rm -f "$emulator_log"
}
trap cleanup EXIT

serial="${ANDROID_SERIAL:-}"
if [[ -n "$serial" ]] && ! "$adb_bin" devices | awk -v serial="$serial" \
	'$1 == serial && $2 == "device" { found = 1 } END { exit !found }'; then
	echo "ANDROID_SERIAL '$serial' is not a connected Android device." >&2
	exit 1
fi

if [[ -z "$serial" ]]; then
	serial="$("$adb_bin" devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
fi
if [[ -z "$serial" ]]; then
	if ! "$emulator_bin" -list-avds | grep -Fxq "$avd_name"; then
		echo "Missing AVD '$avd_name'. Follow docs/testing/android.md to create it." >&2
		exit 1
	fi

	emulator_log="$(mktemp)"
	"$emulator_bin" "@$avd_name" \
		-no-window \
		-no-snapshot \
		-noaudio \
		-no-boot-anim \
		-gpu swiftshader_indirect >"$emulator_log" 2>&1 &
	started_emulator=true

	for _ in {1..180}; do
		serial="$("$adb_bin" devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
		if [[ -n "$serial" ]] && [[ "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
			break
		fi
		sleep 1
	done

	if [[ -z "$serial" ]] || [[ "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]]; then
		echo "Android emulator did not boot. Log: $emulator_log" >&2
		exit 1
	fi
fi

export ANDROID_SERIAL="$serial"
"$adb_bin" -s "$serial" shell pm clear com.pksx.app >/dev/null 2>&1 || true

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root/android"
./gradlew :app:connectedDebugAndroidTest --no-daemon
