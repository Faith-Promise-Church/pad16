import Foundation
import CoreBluetooth

/// Reconnects to the last Bluetooth MIDI device (the WIDI Master) without opening the picker.
/// It scans for peripherals that advertise the BLE MIDI service and connects to the one with the remembered name;
/// CoreMIDI then lists it like any other device.
final class BleReconnector: NSObject, CBCentralManagerDelegate {
    private static let midiService = CBUUID(string: "03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
    private var central: CBCentralManager?
    private var wanted = ""
    private var held: [UUID: CBPeripheral] = [:]

    func watch(name: String) {
        wanted = name
        if central == nil {
            central = CBCentralManager(delegate: self, queue: nil)
        } else {
            scan()
        }
    }

    private func scan() {
        guard let c = central, c.state == .poweredOn, !wanted.isEmpty else { return }
        for p in c.retrieveConnectedPeripherals(withServices: [BleReconnector.midiService]) {
            consider(p, advertisedName: nil)
        }
        if !c.isScanning {
            c.scanForPeripherals(withServices: [BleReconnector.midiService], options: nil)
        }
    }

    private func consider(_ p: CBPeripheral, advertisedName: String?) {
        let name = advertisedName ?? p.name ?? ""
        guard !name.isEmpty else { return }
        let match = wanted.localizedCaseInsensitiveContains(name) || name.localizedCaseInsensitiveContains(wanted)
        guard match, p.state == .disconnected else { return }
        held[p.identifier] = p
        central?.connect(p, options: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        scan()
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        consider(peripheral, advertisedName: advertisementData[CBAdvertisementDataLocalNameKey] as? String)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        scan()
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        held[peripheral.identifier] = nil
    }
}
