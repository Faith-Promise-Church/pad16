import Foundation
import AVFoundation
import AVKit
import UIKit

/// Audio session: playback category, 48 kHz, a short IO buffer, and route and interruption events.
final class AudioSessionController {
    var onRoute: (([String: Any]) -> Void)?
    var onInterruption: ((_ ended: Bool) -> Void)?
    private var pickerView: AVRoutePickerView?

    func start() {
        let session = AVAudioSession.sharedInstance()
        do {
            // mixWithOthers lets the web view's audio and the native cue click sound together
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
            openAllChannels()
        } catch {
            NSLog("Pad16: audio session setup failed: \(error.localizedDescription)")
        }
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        nc.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    /// Ask for every output channel the hardware has, so a multichannel interface is opened in full.
    func openAllChannels() {
        let session = AVAudioSession.sharedInstance()
        let maxChannels = session.maximumOutputNumberOfChannels
        if maxChannels > 2 {
            try? session.setPreferredOutputNumberOfChannels(maxChannels)
        }
    }

    func info() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        let output = session.currentRoute.outputs.first
        let type = output?.portType ?? AVAudioSession.Port.builtInSpeaker
        let bluetooth = type == .bluetoothA2DP || type == .bluetoothLE || type == .bluetoothHFP
        return [
            "name": output?.portName ?? "No output",
            "type": type.rawValue,
            "channels": max(session.outputNumberOfChannels, session.maximumOutputNumberOfChannels),
            "sampleRate": session.sampleRate,
            "ioBufferMs": session.ioBufferDuration * 1000.0,
            "outputLatencyMs": session.outputLatency * 1000.0,
            "bluetooth": bluetooth
        ]
    }

    @objc private func routeChanged(_ note: Notification) {
        openAllChannels()
        onRoute?(info())
    }

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .ended {
            try? AVAudioSession.sharedInstance().setActive(true)
        }
        onInterruption?(type == .ended)
    }

    /// Open the system route picker. AVRoutePickerView has no public "show" call, so its own button is pressed for it.
    func showRoutePicker(in host: UIView) {
        let picker = pickerView ?? AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        picker.isHidden = true
        if picker.superview == nil { host.addSubview(picker) }
        pickerView = picker
        for sub in picker.subviews {
            if let button = sub as? UIButton {
                button.sendActions(for: .touchUpInside)
                break
            }
        }
    }
}
