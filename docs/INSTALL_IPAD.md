# Installing Pad16 on the iPad

There are three ways to run it. Start with the first to try the build, and move to the app for MIDI.

| | MIDI | Separate click output | Needs |
| --- | --- | --- | --- |
| 1. Web app from the home screen | No | Split mode (left and right) | Nothing |
| 2. Web app inside a Web MIDI browser | Yes | Split mode | A free App Store browser |
| 3. The Pad16 iOS app | Yes, CoreMIDI | Multi-out, when the interface has 4 or more outputs | A Mac with Xcode |

## 1. Web app (no MIDI)

1. On the iPad open the site in Safari. The preview of this build is at `https://faith-promise-church.github.io/pad16/next/` once the preview deploy is allowed (see the README); the app you play today stays at the root.
2. Share, Add to Home Screen. It opens full screen.
3. Open it once while online so it caches for offline use.

Safari on iPad has no MIDI and cannot choose an audio output. Sound goes to whatever is plugged in.

## 2. Web app with MIDI, before the native app exists

Install **MIDIWeb Browser** from the App Store (it adds Web MIDI over USB and Bluetooth) and open the same address in it. Pad16 finds Web MIDI by feature and uses it. Because a browser like this may ignore send timestamps, Pad16 measures clock jitter and, if it has to send clock by timer, marks the clock "approximate" in Edit, Setup, MIDI and in Diagnostics.

## 3. The iOS app

### One-time setup on the Mac

1. Install **Xcode** from the App Store and open it once to finish its setup. (When this build was made the Mac had only the Command Line Tools, so the project has not been compiled yet. The first build may need small fixes; see "If the build fails" below.)
2. Point the tools at Xcode: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. In the repo: `npm install`

The clone on this Mac is at `~/Documents/Claude Code Codebase/pad16/pad16`. Version 3 is on the `v3` branch: `git fetch && git checkout v3`.

### Build and run on your iPad

1. `npm run build:ios`
   This builds the web app for iOS and copies it into the Xcode project. The typeface is Barlow. To bundle DIN from `fonts-private/` instead, which needs an app license from its foundry, run it as `PAD16_DIN=1 npm run build:ios`.
2. `open ios/App/App.xcodeproj`
3. Select the **App** target, **Signing & Capabilities**:
   - Tick **Automatically manage signing**.
   - **Team**: choose the Faith Promise Apple Developer team. (Xcode, Settings, Accounts, add the Apple ID first if the team is not listed.)
   - **Bundle Identifier**: `org.faithpromise.pad16`. Change it if that identifier is taken.
   - **Background Modes** should show Audio. It is already in `Info.plist`.
4. Plug in the iPad, unlock it, tap Trust. On the iPad: Settings, Privacy & Security, **Developer Mode**, on (it restarts).
5. Pick the iPad as the run destination and press Run. The first launch asks for Bluetooth permission: allow it, it is how the WIDI Master connects.
6. In Pad16: Edit, Setup, MIDI, **Connect Bluetooth device**, choose WIDI Master.

After changing web code, run `npm run build:ios` again and press Run.

### TestFlight (so the app does not expire and installs without a cable)

A build installed straight from Xcode with a paid developer team lasts a year; TestFlight builds last 90 days but update over the air and install on the iPhone too.

1. In [App Store Connect](https://appstoreconnect.apple.com), Apps, add a new app: platform iOS, name Pad16, bundle ID `org.faithpromise.pad16` (register the identifier under Certificates, Identifiers & Profiles if it is not offered).
2. In Xcode set the destination to **Any iOS Device**, then Product, **Archive**.
3. In the Organizer: **Distribute App**, TestFlight & App Store, Upload.
4. Back in App Store Connect, TestFlight tab: when the build finishes processing, add yourself under Internal Testing.
5. On the iPad install the **TestFlight** app, sign in, install Pad16.

For each new build raise the build number (App target, General, Build) before archiving. Export compliance is already answered in `Info.plist` (no non-exempt encryption).

### If the build fails

The Swift code is in `plugins/pad16-native/ios/Sources/Pad16NativePlugin/`. Four of its six files (the clock, CoreMIDI, Bluetooth reconnect and the cue click) were type-checked on this Mac against the macOS SDK with no errors. The other two, `AudioSessionController.swift` and `Pad16NativePlugin.swift`, use iOS-only frameworks and could not be checked without Xcode. If Xcode reports an error there, paste it into Claude Code in this repo with "continue from PROGRESS.md" and it can be fixed in a few minutes.

To prove the project compiles without a device: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' build`

### What the app adds over the web build

- MIDI in and out through CoreMIDI, USB and Bluetooth alike, with hot-plug.
- Clock generated natively with CoreMIDI timestamps, scheduled ahead of time.
- The system route picker, the route name and channel count, and a warning when the route is Bluetooth audio.
- A 48 kHz session with a short IO buffer (requested; Diagnostics shows what the system granted).
- The screen stays awake.
- The native cue route: when the web view only opens two channels on a multichannel interface, the click and count-in are played by the app itself on the output pair you choose.
