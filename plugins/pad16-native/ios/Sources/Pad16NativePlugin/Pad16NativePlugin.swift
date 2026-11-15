import Foundation
import Capacitor
import UIKit
import CoreAudioKit

/// Pad16's native shell: CoreMIDI in and out with a timestamped clock generator, audio session control,
/// the system route and Bluetooth MIDI pickers, and the native cue click. The JavaScript side is src/native/plugin.ts.
@objc(Pad16NativePlugin)
public class Pad16NativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "Pad16NativePlugin"
    public let jsName = "Pad16Native"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "now", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "audioInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showRoutePicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "midiPorts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "midiSend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "midiSetClock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "midiBluetoothPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "midiReconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clickConfigure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clickSetSample", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clickSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clickSilence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testTone", returnType: CAPPluginReturnPromise)
    ]

    private let midi = MidiEngine()
    private let session = AudioSessionController()
    private let click = CueClick()
    private let ble = BleReconnector()
    private var timer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "org.faithpromise.pad16.clock", qos: .userInteractive)

    override public func load() {
        session.onRoute = { [weak self] info in self?.notifyListeners("route", data: info) }
        session.onInterruption = { [weak self] ended in self?.notifyListeners("interruption", data: ["ended": ended]) }
        session.start()

        midi.onMessage = { [weak self] port, bytes, ms in
            self?.notifyListeners("midi", data: ["port": port, "data": bytes.map { Int($0) }, "ms": ms])
        }
        midi.onPortsChanged = { [weak self] in self?.notifyListeners("midiPorts", data: [:]) }
        midi.start()

        // one timer drives both generators; the timer only decides how far ahead to schedule, never when things sound
        let t = DispatchSource.makeTimerSource(queue: timerQueue)
        t.schedule(deadline: .now(), repeating: .milliseconds(5), leeway: .milliseconds(1))
        t.setEventHandler { [weak self] in
            let now = HostClock.nowMs()
            self?.midi.tickClock(nowMs: now)
            self?.click.tick(nowMs: now)
        }
        t.resume()
        timer = t

        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
    }

    private func number(_ value: Any?) -> Double {
        if let n = value as? NSNumber { return n.doubleValue }
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        return 0
    }

    // MARK: time and audio session

    @objc func now(_ call: CAPPluginCall) {
        call.resolve(["ms": HostClock.nowMs()])
    }

    @objc func audioInfo(_ call: CAPPluginCall) {
        call.resolve(session.info())
    }

    @objc func showRoutePicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let view = self.bridge?.viewController?.view { self.session.showRoutePicker(in: view) }
            call.resolve()
        }
    }

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? true
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }

    // MARK: MIDI

    private func describe(_ ports: [MidiPortInfo]) -> [[String: Any]] {
        return ports.map { ["id": $0.id, "name": $0.name, "kind": $0.kind] }
    }

    @objc func midiPorts(_ call: CAPPluginCall) {
        call.resolve(["inputs": describe(midi.inputs()), "outputs": describe(midi.outputs())])
    }

    @objc func midiSend(_ call: CAPPluginCall) {
        let ports = call.getArray("ports", String.self) ?? []
        let data = (call.getArray("data") ?? []).map { UInt8(truncatingIfNeeded: Int(number($0))) }
        let at: Double? = call.getDouble("atMs")
        midi.send(data, to: ports, atMs: at)
        call.resolve()
    }

    @objc func midiSetClock(_ call: CAPPluginCall) {
        let raw = call.getArray("segments", JSObject.self) ?? []
        let segments = raw.map { ClockSegment(startMs: number($0["startMs"]), firstPulseMs: number($0["firstPulseMs"]), periodMs: number($0["periodMs"])) }
        var offsets: [String: Double] = [:]
        for (key, value) in call.getObject("offsets") ?? [:] { offsets[key] = number(value) }
        midi.setClock(segments: segments, ports: call.getArray("ports", String.self) ?? [], offsets: offsets)
        call.resolve()
    }

    @objc func midiBluetoothPicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker = CABTMIDICentralViewController()
            picker.navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(self.closePicker))
            let nav = UINavigationController(rootViewController: picker)
            nav.modalPresentationStyle = .formSheet
            self.bridge?.viewController?.present(nav, animated: true) { call.resolve() }
        }
    }

    @objc private func closePicker() {
        bridge?.viewController?.dismiss(animated: true, completion: nil)
    }

    @objc func midiReconnect(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        DispatchQueue.main.async {
            if !name.isEmpty { self.ble.watch(name: name) }
            call.resolve()
        }
    }

    // MARK: native cue click

    @objc func clickConfigure(_ call: CAPPluginCall) {
        session.openAllChannels()
        let ok = click.configure(
            enabled: call.getBool("enabled") ?? false,
            firstOutput: call.getInt("firstOutput") ?? 2,
            on: call.getBool("on") ?? false,
            accent: Float(call.getDouble("accent") ?? 1),
            beat: Float(call.getDouble("beat") ?? 0.8),
            sub: Float(call.getDouble("sub") ?? 0.5),
            offsetMs: call.getDouble("offsetMs") ?? 0,
            master: Float(call.getDouble("master") ?? 0.8))
        call.resolve(["ok": ok, "channels": click.channels, "error": click.lastError])
    }

    @objc func clickSetSample(_ call: CAPPluginCall) {
        guard let slot = call.getString("slot"), let b64 = call.getString("wavBase64"), let data = Data(base64Encoded: b64) else {
            call.reject("slot and wavBase64 are required")
            return
        }
        click.setSample(slot: slot, wav: data)
        call.resolve()
    }

    @objc func clickSync(_ call: CAPPluginCall) {
        let raw = call.getArray("segments", JSObject.self) ?? []
        let segments = raw.map {
            ClickSegment(startMs: number($0["startMs"]), firstBeatMs: number($0["firstBeatMs"]), beatMs: number($0["beatMs"]),
                         bpb: Int(number($0["bpb"])), spb: Int(number($0["spb"])), firstBeatIndex: Int(number($0["firstBeatIndex"])))
        }
        click.sync(segments: segments)
        call.resolve()
    }

    @objc func clickSilence(_ call: CAPPluginCall) {
        click.silence()
        call.resolve()
    }

    @objc func testTone(_ call: CAPPluginCall) {
        let ok = click.testTone(output: call.getInt("output") ?? 0)
        call.resolve(["ok": ok, "error": ok ? "" : "the native audio engine is not running on that output"])
    }
}
