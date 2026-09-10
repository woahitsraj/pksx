#!/usr/bin/env bash
set -euo pipefail

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME="$sdk_root"
adb_bin="$sdk_root/platform-tools/adb"
emulator_bin="$sdk_root/emulator/emulator"
avd_name="${PKSX_ANDROID_AVD:-pksx-api-36}"
started_emulator=false
emulator_log=""
device_state_captured=false
original_size_state=""
original_density_state=""
original_size_override=""
original_density_override=""
original_fixed_rotation=""
original_rotation_mode=""
original_rotation_angle=""
original_stylus_handwriting=""

if [[ "$(uname)" == "Darwin" ]] && [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
	export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi

capture_device_state() {
	local size_state density_state display_state
	size_state="$("$adb_bin" -s "$serial" shell wm size | tr -d '\r')"
	density_state="$("$adb_bin" -s "$serial" shell wm density | tr -d '\r')"
	original_size_state="$size_state"
	original_density_state="$density_state"
	if [[ "$size_state" =~ Override\ size:\ ([0-9]+x[0-9]+) ]]; then
		original_size_override="${BASH_REMATCH[1]}"
	fi
	if [[ "$density_state" =~ Override\ density:\ ([0-9]+) ]]; then
		original_density_override="${BASH_REMATCH[1]}"
	fi
	original_fixed_rotation="$("$adb_bin" -s "$serial" shell cmd window fixed-to-user-rotation | tr -d '\r')"
	original_rotation_mode="$("$adb_bin" -s "$serial" shell cmd window user-rotation | tr -d '\r')"
	original_stylus_handwriting="$("$adb_bin" -s "$serial" shell settings get secure stylus_handwriting_enabled | tr -d '\r')"
	display_state="$("$adb_bin" -s "$serial" shell dumpsys display | tr -d '\r')"
	if [[ ! "$display_state" =~ rotation[[:space:]]([0-3]), ]]; then
		echo "Could not capture Android display rotation for '$serial'." >&2
		return 1
	fi
	original_rotation_angle="${BASH_REMATCH[1]}"
	if [[ ! "$original_rotation_mode" =~ ^(free|lock\ [0-3])$ ]]; then
		echo "Unexpected Android user rotation state: $original_rotation_mode" >&2
		return 1
	fi
	device_state_captured=true
}

restore_command() {
	if ! "$@" >/dev/null; then
		echo "Android cleanup command failed: $*" >&2
		restore_failed=true
	fi
}

await_device_value() {
	local expected="$1"
	shift
	local actual=""
	for _ in {1..40}; do
		actual="$("$adb_bin" -s "$serial" shell "$@" 2>/dev/null | tr -d '\r')"
		[[ "$actual" != "$expected" ]] || return 0
		sleep 0.5
	done
	echo "Android cleanup did not restore '$*': expected '$expected', got '$actual'." >&2
	return 1
}

await_display_angle() {
	local display_state actual=""
	for _ in {1..40}; do
		display_state="$("$adb_bin" -s "$serial" shell dumpsys display 2>/dev/null | tr -d '\r')"
		if [[ "$display_state" =~ rotation[[:space:]]([0-3]), ]]; then
			actual="${BASH_REMATCH[1]}"
			[[ "$actual" != "$original_rotation_angle" ]] || return 0
		fi
		sleep 0.5
	done
	echo "Android cleanup did not restore display angle: expected '$original_rotation_angle', got '$actual'." >&2
	return 1
}

settle_fixed_rotation_policy() {
	local actual=""
	for _ in {1..40}; do
		"$adb_bin" -s "$serial" shell cmd window fixed-to-user-rotation "$original_fixed_rotation" >/dev/null 2>&1 || true
		actual="$("$adb_bin" -s "$serial" shell cmd window fixed-to-user-rotation 2>/dev/null | tr -d '\r')"
		[[ "$actual" != "$original_fixed_rotation" ]] || return 0
		sleep 0.5
	done
	echo "Android cleanup did not settle fixed rotation: expected '$original_fixed_rotation', got '$actual'." >&2
	return 1
}

settle_user_rotation_policy() {
	local actual=""
	for _ in {1..40}; do
		if [[ "$original_rotation_mode" == "free" ]]; then
			"$adb_bin" -s "$serial" shell cmd window user-rotation free >/dev/null 2>&1 || true
		else
			"$adb_bin" -s "$serial" shell cmd window user-rotation lock "${original_rotation_mode#lock }" >/dev/null 2>&1 || true
		fi
		actual="$("$adb_bin" -s "$serial" shell cmd window user-rotation 2>/dev/null | tr -d '\r')"
		[[ "$actual" != "$original_rotation_mode" ]] || return 0
		sleep 0.5
	done
	echo "Android cleanup did not settle user rotation: expected '$original_rotation_mode', got '$actual'." >&2
	return 1
}

restore_device_state() {
	restore_failed=false
	restore_command "$adb_bin" -s "$serial" shell wm size "${original_size_override:-reset}"
	restore_command "$adb_bin" -s "$serial" shell wm density "${original_density_override:-reset}"
	restore_command "$adb_bin" -s "$serial" shell cmd window fixed-to-user-rotation enabled
	restore_command "$adb_bin" -s "$serial" shell cmd window user-rotation lock "$original_rotation_angle"
	await_display_angle || restore_failed=true
	restore_command "$adb_bin" -s "$serial" shell cmd window fixed-to-user-rotation "$original_fixed_rotation"
	if [[ "$original_rotation_mode" == "free" ]]; then
		restore_command "$adb_bin" -s "$serial" shell cmd window user-rotation free
	else
		restore_command "$adb_bin" -s "$serial" shell cmd window user-rotation lock "${original_rotation_mode#lock }"
	fi
	if [[ "$original_stylus_handwriting" == "null" ]]; then
		restore_command "$adb_bin" -s "$serial" shell settings delete secure stylus_handwriting_enabled
	else
		restore_command "$adb_bin" -s "$serial" shell settings put secure stylus_handwriting_enabled "$original_stylus_handwriting"
	fi
	settle_fixed_rotation_policy || restore_failed=true
	settle_user_rotation_policy || restore_failed=true
	await_device_value "$original_size_state" wm size || restore_failed=true
	await_device_value "$original_density_state" wm density || restore_failed=true
	await_device_value "$original_stylus_handwriting" settings get secure stylus_handwriting_enabled || restore_failed=true
	$restore_failed && return 1
	return 0
}

cleanup() {
	local exit_status=$?
	local restore_status=0
	trap - EXIT
	if $started_emulator; then
		"$adb_bin" -s "$serial" emu kill >/dev/null 2>&1 || true
	elif $device_state_captured; then
		restore_device_state || restore_status=$?
	fi
	[[ -z "$emulator_log" ]] || rm -f "$emulator_log"
	if ((exit_status == 0 && restore_status != 0)); then
		exit_status=$restore_status
	fi
	exit "$exit_status"
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
if ! $started_emulator; then
	capture_device_state
fi
"$adb_bin" -s "$serial" shell pm clear com.pksx.app >/dev/null 2>&1 || true

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root/android"
./gradlew :app:connectedDebugAndroidTest --no-daemon
