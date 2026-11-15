import Foundation
import CoreMIDI

struct MidiPortInfo {
    let id: String
    let name: String
    let kind: String
    let ref: MIDIEndpointRef
}

struct ClockSegment {
    let startMs: Double
    let firstPulseMs: Double
    let periodMs: Double
}

/// CoreMIDI client. USB and Bluetooth LE devices look the same here: every source is connected as it appears.
final class MidiEngine {
    var onMessage: ((_ port: String, _ bytes: [UInt8], _ ms: Double) -> Void)?
    var onPortsChanged: (() -> Void)?

    private var client = MIDIClientRef()
    private var inPort = MIDIPortRef()
    private var outPort = MIDIPortRef()
    private var connected = Set<MIDIEndpointRef>()
    private let lock = NSLock()

    // clock generator state, guarded by lock
    private var segments: [ClockSegment] = []
    private var clockPorts: [String] = []
    private var clockOffsets: [String: Double] = [:]
    private var scheduledUntilMs: Double = 0
    private var lastPulseMs: Double = -1_000_000

    func start() {
        MIDIClientCreateWithBlock("Pad16" as CFString, &client) { [weak self] _ in
            self?.rescan()
        }
        MIDIInputPortCreateWithBlock(client, "Pad16 In" as CFString, &inPort) { [weak self] packetList, refCon in
            self?.receive(packetList, refCon: refCon)
        }
        MIDIOutputPortCreate(client, "Pad16 Out" as CFString, &outPort)
        rescan()
    }

    // MARK: ports

    private func stringProperty(_ obj: MIDIObjectRef, _ key: CFString) -> String? {
        var value: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(obj, key, &value) == noErr, let v = value else { return nil }
        return v.takeRetainedValue() as String
    }

    private func uniqueId(_ obj: MIDIObjectRef) -> Int32 {
        var id: Int32 = 0
        MIDIObjectGetIntegerProperty(obj, kMIDIPropertyUniqueID, &id)
        return id
    }

    private func info(_ endpoint: MIDIEndpointRef) -> MidiPortInfo {
        let name = stringProperty(endpoint, kMIDIPropertyDisplayName) ?? stringProperty(endpoint, kMIDIPropertyName) ?? "MIDI device"
        var kind = "usb"
        var entity = MIDIEntityRef()
        var device = MIDIDeviceRef()
        if MIDIEndpointGetEntity(endpoint, &entity) == noErr, MIDIEntityGetDevice(entity, &device) == noErr {
            let driver = stringProperty(device, kMIDIPropertyDriverOwner) ?? ""
            if driver.lowercased().contains("bluetooth") { kind = "ble" }
        }
        return MidiPortInfo(id: String(uniqueId(endpoint)), name: name, kind: kind, ref: endpoint)
    }

    func inputs() -> [MidiPortInfo] {
        return (0..<MIDIGetNumberOfSources()).map { info(MIDIGetSource($0)) }
    }

    func outputs() -> [MidiPortInfo] {
        return (0..<MIDIGetNumberOfDestinations()).map { info(MIDIGetDestination($0)) }
    }

    /// Connect every source, including ones that were hot-plugged or just paired over Bluetooth.
    private func rescan() {
        var now = Set<MIDIEndpointRef>()
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            now.insert(src)
            if !connected.contains(src) {
                let ref = UnsafeMutableRawPointer(bitPattern: Int(uniqueId(src)))
                MIDIPortConnectSource(inPort, src, ref)
            }
        }
        connected = now
        onPortsChanged?()
    }

    // MARK: input

    private func receive(_ packetList: UnsafePointer<MIDIPacketList>, refCon: UnsafeMutableRawPointer?) {
        let port = String(Int32(truncatingIfNeeded: Int(bitPattern: refCon)))
        let count = Int(packetList.pointee.numPackets)
        guard let packetOffset = MemoryLayout<MIDIPacketList>.offset(of: \MIDIPacketList.packet),
              let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data) else { return }
        var packet = UnsafeRawPointer(packetList).advanced(by: packetOffset).assumingMemoryBound(to: MIDIPacket.self)
        for _ in 0..<count {
            let length = Int(packet.pointee.length)
            let stamp = packet.pointee.timeStamp
            let raw = UnsafeRawBufferPointer(start: UnsafeRawPointer(packet).advanced(by: dataOffset), count: length)
            let ms = stamp == 0 ? HostClock.nowMs() : HostClock.ticksToMs(stamp)
            split(Array(raw)).forEach { onMessage?(port, $0, ms) }
            packet = UnsafePointer(MIDIPacketNext(packet))
        }
    }

    /// A packet can hold several messages. Split on status bytes; real-time bytes pass through on their own.
    private func split(_ bytes: [UInt8]) -> [[UInt8]] {
        var out: [[UInt8]] = []
        var current: [UInt8] = []
        for b in bytes {
            if b >= 0xF8 { out.append([b]); continue }
            if b & 0x80 != 0 {
                if !current.isEmpty { out.append(current) }
                current = [b]
            } else if !current.isEmpty {
                current.append(b)
                let status = current[0] & 0xF0
                let need = (status == 0xC0 || status == 0xD0) ? 2 : 3
                if current[0] < 0xF0 && current.count == need {
                    out.append(current)
                    current = [current[0]]          // running status
                }
            }
        }
        if current.count > 1 { out.append(current) }
        return out
    }

    // MARK: output

    private func destination(_ id: String) -> MIDIEndpointRef? {
        for i in 0..<MIDIGetNumberOfDestinations() {
            let d = MIDIGetDestination(i)
            if String(uniqueId(d)) == id { return d }
        }
        return nil
    }

    func send(_ bytes: [UInt8], to ids: [String], atMs: Double?) {
        let stamp: MIDITimeStamp = atMs == nil ? 0 : HostClock.msToTicks(atMs!)
        for id in ids {
            guard let dest = destination(id) else { continue }
            sendRaw(bytes, to: dest, stamp: stamp)
        }
    }

    private func sendRaw(_ bytes: [UInt8], to dest: MIDIEndpointRef, stamp: MIDITimeStamp) {
        var list = MIDIPacketList()
        withUnsafeMutablePointer(to: &list) { ptr in
            let first = MIDIPacketListInit(ptr)
            _ = MIDIPacketListAdd(ptr, MemoryLayout<MIDIPacketList>.size, first, stamp, bytes.count, bytes)
            MIDISend(outPort, dest, ptr)
        }
    }

    // MARK: clock

    /// The tempo map as steady stretches of clock. Pulses are made here, timestamped and sent ahead of time.
    func setClock(segments: [ClockSegment], ports: [String], offsets: [String: Double]) {
        lock.lock()
        self.segments = segments.sorted { $0.startMs < $1.startMs }
        self.clockPorts = ports
        self.clockOffsets = offsets
        lock.unlock()
    }

    /// Called every few milliseconds. Sends every pulse due in the next 50 ms, each with its own CoreMIDI timestamp.
    func tickClock(nowMs: Double) {
        lock.lock()
        let segs = segments
        let ports = clockPorts
        let offsets = clockOffsets
        var from = max(scheduledUntilMs, nowMs)
        let to = nowMs + 50
        lock.unlock()
        guard !segs.isEmpty, !ports.isEmpty, to > from else {
            lock.lock(); scheduledUntilMs = max(scheduledUntilMs, to); lock.unlock()
            return
        }
        let dests: [(MIDIEndpointRef, Double)] = ports.compactMap { id in
            guard let d = destination(id) else { return nil }
            return (d, offsets[id] ?? 0)
        }
        var last = lastPulseMs
        for (i, seg) in segs.enumerated() {
            let end = i + 1 < segs.count ? segs[i + 1].startMs : Double.greatestFiniteMagnitude
            let lo = max(from, i == 0 ? -Double.greatestFiniteMagnitude : seg.startMs)
            let hi = min(to, end)
            if hi <= lo || seg.periodMs <= 0 { continue }
            var k = max(0, (lo - seg.firstPulseMs) / seg.periodMs).rounded(.up)
            while true {
                let t = seg.firstPulseMs + k * seg.periodMs
                if t >= hi { break }
                // after a restart the grid moves: never let two pulses land closer than half a period
                if t - last >= seg.periodMs * 0.5 {
                    for (dest, offset) in dests {
                        sendRaw([0xF8], to: dest, stamp: HostClock.msToTicks(t + offset))
                    }
                    last = t
                }
                k += 1
            }
        }
        from = to
        lock.lock()
        scheduledUntilMs = from
        lastPulseMs = last
        lock.unlock()
    }
}
