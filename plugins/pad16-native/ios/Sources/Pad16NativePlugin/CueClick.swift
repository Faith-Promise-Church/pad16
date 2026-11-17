import Foundation
import AVFoundation

struct ClickSegment {
    let startMs: Double
    let firstBeatMs: Double
    let beatMs: Double
    let bpb: Int
    let spb: Int
    let firstBeatIndex: Int
}

/// The native cue route: click and count-in played by AVAudioEngine on a chosen output pair,
/// started on host time from the same tempo map that drives MIDI clock.
/// Used when the web view only opens two channels on a multichannel interface.
final class CueClick {
    private let engine = AVAudioEngine()
    private let mixer = AVAudioMixerNode()
    private var players: [AVAudioPlayerNode] = []
    private var nextPlayer = 0
    private var format: AVAudioFormat?
    private let lock = NSLock()

    private var enabled = false
    private var firstOutput = 2
    private var clickOn = false
    private var levels: [String: Float] = ["accent": 1, "beat": 0.8, "sub": 0.5]
    private var master: Float = 0.8
    private var offsetMs: Double = 0
    private var samples: [String: [Float]] = [:]       // mono source at the engine rate
    private var buffers: [String: AVAudioPCMBuffer] = [:]
    private var segments: [ClickSegment] = []
    private var scheduledUntilMs: Double = 0
    private(set) var channels = 0
    private(set) var lastError = ""

    /// Start or stop the engine. Returns false, with lastError set, when the hardware has no room for a cue pair.
    func configure(enabled: Bool, firstOutput: Int, on: Bool, accent: Float, beat: Float, sub: Float, offsetMs: Double, master: Float) -> Bool {
        lock.lock(); defer { lock.unlock() }
        self.clickOn = on
        self.levels = ["accent": accent, "beat": beat, "sub": sub]
        self.master = master
        self.offsetMs = offsetMs
        if !enabled {
            stopEngine()
            self.enabled = false
            return true
        }
        let hardware = Int(engine.outputNode.outputFormat(forBus: 0).channelCount)
        channels = hardware
        if hardware < 4 || firstOutput + 1 >= hardware {
            lastError = "the audio hardware reports \(hardware) output channels, so there is no separate pair for the click"
            stopEngine()
            self.enabled = false
            return false
        }
        if !self.enabled || firstOutput != self.firstOutput || format == nil || Int(format!.channelCount) != hardware {
            self.firstOutput = firstOutput
            do { try startEngine(hardwareChannels: hardware) } catch {
                lastError = "the click engine could not start: \(error.localizedDescription)"
                self.enabled = false
                return false
            }
        }
        self.enabled = true
        lastError = ""
        rebuildBuffers()
        return true
    }

    private func startEngine(hardwareChannels: Int) throws {
        stopEngine()
        let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        // a discrete layout: every hardware output is its own channel, nothing is folded down
        guard let layout = AVAudioChannelLayout(layoutTag: kAudioChannelLayoutTag_DiscreteInOrder | UInt32(hardwareChannels)) else {
            throw NSError(domain: "Pad16", code: 1, userInfo: [NSLocalizedDescriptionKey: "no channel layout for \(hardwareChannels) channels"])
        }
        let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, interleaved: false, channelLayout: layout)
        format = fmt
        if players.isEmpty {
            engine.attach(mixer)
            for _ in 0..<8 {
                let p = AVAudioPlayerNode()
                engine.attach(p)
                players.append(p)
            }
        }
        for p in players { engine.connect(p, to: mixer, format: fmt) }
        engine.connect(mixer, to: engine.outputNode, format: fmt)
        engine.prepare()
        try engine.start()
        for p in players { p.play() }
    }

    private func stopEngine() {
        if engine.isRunning {
            for p in players { p.stop() }
            engine.stop()
        }
        format = nil
    }

    /// A click sample as 16-bit PCM WAV, the same file the web click uses.
    func setSample(slot: String, wav: Data) {
        guard let decoded = CueClick.decodeWav(wav) else { return }
        lock.lock(); defer { lock.unlock() }
        let rate = format?.sampleRate ?? engine.outputNode.outputFormat(forBus: 0).sampleRate
        var mono = decoded.samples
        if abs(decoded.sampleRate - rate) > 1, decoded.sampleRate > 0 {
            // linear resample to the hardware rate
            let ratio = decoded.sampleRate / rate
            let n = Int(Double(mono.count) / ratio)
            var out = [Float](repeating: 0, count: n)
            for i in 0..<n {
                let pos = Double(i) * ratio
                let a = Int(pos), b = min(a + 1, mono.count - 1)
                let f = Float(pos - Double(a))
                out[i] = mono[a] * (1 - f) + mono[b] * f
            }
            mono = out
        }
        // keep ticks short so they never queue behind one another
        let maxLen = Int(rate * 0.4)
        if mono.count > maxLen {
            mono = Array(mono[0..<maxLen])
            let fade = Int(rate * 0.01)
            for i in 0..<fade { mono[maxLen - 1 - i] *= Float(i) / Float(fade) }
        }
        samples[slot] = mono
        rebuildBuffers()
    }

    /// Bake the level into each tick and place it on the cue pair only.
    private func rebuildBuffers() {
        guard let fmt = format else { return }
        buffers.removeAll()
        for (slot, mono) in samples {
            guard !mono.isEmpty, let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(mono.count)),
                  let data = buf.floatChannelData else { continue }
            buf.frameLength = AVAudioFrameCount(mono.count)
            let gain = (levels[slot] ?? 1) * master
            for ch in 0..<Int(fmt.channelCount) {
                let on = ch == firstOutput || ch == firstOutput + 1
                for i in 0..<mono.count { data[ch][i] = on ? mono[i] * gain : 0 }
            }
            buffers[slot] = buf
        }
    }

    func sync(segments: [ClickSegment]) {
        lock.lock()
        self.segments = segments.sorted { $0.startMs < $1.startMs }
        lock.unlock()
    }

    func silence() {
        lock.lock(); defer { lock.unlock() }
        segments = []
        guard engine.isRunning else { return }
        for p in players { p.stop(); p.play() }
    }

    /// Called every few milliseconds. Schedules every tick due in the next 100 ms on host time.
    func tick(nowMs: Double) {
        lock.lock(); defer { lock.unlock() }
        let to = nowMs + 100
        let from = max(scheduledUntilMs, nowMs)
        scheduledUntilMs = to
        guard enabled, engine.isRunning, !segments.isEmpty, to > from else { return }
        for (i, seg) in segments.enumerated() {
            let end = i + 1 < segments.count ? segments[i + 1].startMs : Double.greatestFiniteMagnitude
            let lo = max(from, i == 0 ? -Double.greatestFiniteMagnitude : seg.startMs)
            let hi = min(to, end)
            if hi <= lo || seg.beatMs <= 0 || seg.spb <= 0 || seg.bpb <= 0 { continue }
            let step = seg.beatMs / Double(seg.spb)
            var n = Int(max(0, (lo - offsetMs - seg.firstBeatMs) / step).rounded(.up))
            while true {
                let t = seg.firstBeatMs + Double(n) * step + offsetMs
                if t >= hi { break }
                let isSub = n % seg.spb != 0
                let beatIndex = seg.firstBeatIndex + n / seg.spb
                let countIn = beatIndex < 0
                let inBar = ((beatIndex % seg.bpb) + seg.bpb) % seg.bpb
                let slot = isSub ? "sub" : (inBar == 0 ? "accent" : "beat")
                // the count-in always sounds, without subdivisions; after it the click follows its on/off switch
                let audible = countIn ? !isSub : clickOn
                if audible, (levels[slot] ?? 0) > 0.001, let buf = buffers[slot] {
                    let player = players[nextPlayer]
                    nextPlayer = (nextPlayer + 1) % players.count
                    player.scheduleBuffer(buf, at: AVAudioTime(hostTime: HostClock.msToTicks(t)), options: [], completionHandler: nil)
                }
                n += 1
            }
        }
    }

    /// One second of tone on a single hardware output, counted from 0.
    func testTone(output: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard enabled, engine.isRunning, let fmt = format, output >= 0, output < Int(fmt.channelCount) else { return false }
        let frames = Int(fmt.sampleRate)
        guard let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(frames)), let data = buf.floatChannelData else { return false }
        buf.frameLength = AVAudioFrameCount(frames)
        let fade = Int(fmt.sampleRate * 0.02)
        for ch in 0..<Int(fmt.channelCount) {
            for i in 0..<frames {
                if ch != output { data[ch][i] = 0; continue }
                let env = Float(min(1.0, min(Double(i), Double(frames - 1 - i)) / Double(fade)))
                data[ch][i] = 0.25 * env * sinf(2 * Float.pi * 440 * Float(i) / Float(fmt.sampleRate))
            }
        }
        let player = players[nextPlayer]
        nextPlayer = (nextPlayer + 1) % players.count
        player.scheduleBuffer(buf, at: nil, options: [], completionHandler: nil)
        return true
    }

    /// Minimal WAV reader: 16-bit PCM, any channel count, mixed to mono.
    static func decodeWav(_ data: Data) -> (samples: [Float], sampleRate: Double)? {
        let bytes = [UInt8](data)
        guard bytes.count > 44 else { return nil }
        func u16(_ o: Int) -> Int { return Int(bytes[o]) | (Int(bytes[o + 1]) << 8) }
        func u32(_ o: Int) -> Int { return u16(o) | (u16(o + 2) << 16) }
        var offset = 12
        var channelCount = 1
        var rate = 48_000.0
        var dataStart = -1
        var dataLength = 0
        while offset + 8 <= bytes.count {
            let id = String(bytes: bytes[offset..<offset + 4], encoding: .ascii) ?? ""
            let size = u32(offset + 4)
            if id == "fmt " {
                channelCount = max(1, u16(offset + 10))
                rate = Double(u32(offset + 12))
            } else if id == "data" {
                dataStart = offset + 8
                dataLength = min(size, bytes.count - dataStart)
                break
            }
            offset += 8 + size + (size & 1)
        }
        guard dataStart >= 0 else { return nil }
        let frames = dataLength / (2 * channelCount)
        var out = [Float](repeating: 0, count: frames)
        for i in 0..<frames {
            var sum: Float = 0
            for c in 0..<channelCount {
                let o = dataStart + (i * channelCount + c) * 2
                let v = Int16(bitPattern: UInt16(bytes[o]) | (UInt16(bytes[o + 1]) << 8))
                sum += Float(v) / 32768.0
            }
            out[i] = sum / Float(channelCount)
        }
        return (out, rate)
    }
}
