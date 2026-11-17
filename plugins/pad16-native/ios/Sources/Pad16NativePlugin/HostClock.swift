import Foundation

/// One clock for everything native: mach host time, in milliseconds. MIDI timestamps and audio start times both derive from it.
enum HostClock {
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    static func nowMs() -> Double {
        return ticksToMs(mach_absolute_time())
    }

    static func ticksToMs(_ ticks: UInt64) -> Double {
        return Double(ticks) * Double(timebase.numer) / Double(timebase.denom) / 1_000_000.0
    }

    static func msToTicks(_ ms: Double) -> UInt64 {
        let nanos = max(0, ms) * 1_000_000.0
        return UInt64(nanos * Double(timebase.denom) / Double(timebase.numer))
    }
}
