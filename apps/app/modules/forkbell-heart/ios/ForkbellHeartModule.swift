// Live heart rate over Bluetooth, from anything offering the standard Heart
// Rate service (0x180D): a Garmin with "Broadcast Heart Rate" on, a Polar or
// Wahoo strap, most gym watches. Only while Forkbell is open; nothing runs in
// the background.
import ExpoModulesCore
import CoreBluetooth

private let heartRateService = CBUUID(string: "180D")
private let heartRateMeasurement = CBUUID(string: "2A37")

public class ForkbellHeartModule: Module {
  private lazy var central = HeartRateCentral { [weak self] event, body in
    self?.sendEvent(event, body)
  }

  public func definition() -> ModuleDefinition {
    Name("ForkbellHeart")
    Events("onHeartRate", "onState")

    Function("isSupported") { () -> Bool in true }

    // Devices nearby offering heart rate, found within `seconds`.
    AsyncFunction("scan") { (seconds: Double, promise: Promise) in
      self.central.scan(seconds: seconds) { found, error in
        if let error = error { promise.reject("ERR_BLUETOOTH", error) } else { promise.resolve(found) }
      }
    }

    // Connect (and keep reconnecting) to a device found earlier, by its id.
    Function("connect") { (id: String) in self.central.connect(id: id) }
    Function("disconnect") { self.central.disconnect() }
    Function("latest") { () -> [String: Any]? in self.central.latest }
    Function("state") { () -> String in self.central.stateName }
  }
}

final class HeartRateCentral: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  private let emit: (String, [String: Any]) -> Void
  private let queue = DispatchQueue(label: "forkbell.heart")
  private var manager: CBCentralManager!
  private var found: [UUID: (peripheral: CBPeripheral, name: String, rssi: Int)] = [:]
  private var scanDone: (([[String: Any]], String?) -> Void)?
  private var pendingScan: Double?
  private var wantedId: UUID?
  private var peripheral: CBPeripheral?
  private(set) var latest: [String: Any]?
  private(set) var stateName = "idle"

  init(emit: @escaping (String, [String: Any]) -> Void) {
    self.emit = emit
    super.init()
    manager = CBCentralManager(delegate: self, queue: queue)
  }

  private func setState(_ s: String) {
    stateName = s
    emit("onState", ["state": s])
  }

  func scan(seconds: Double, done: @escaping ([[String: Any]], String?) -> Void) {
    queue.async {
      self.found.removeAll()
      self.scanDone = done
      if self.manager.state == .poweredOn { self.startScan(seconds: seconds) } else { self.pendingScan = seconds }
      if self.manager.state == .poweredOff { self.finishScan(error: "Bluetooth is off. Turn it on in Control Center.") }
      if self.manager.state == .unauthorized { self.finishScan(error: "Forkbell isn't allowed to use Bluetooth. Turn it on in Settings → Forkbell.") }
    }
  }

  private func startScan(seconds: Double) {
    pendingScan = nil
    // Already-connected sensors (a watch paired with the phone) don't advertise; list them too.
    for p in manager.retrieveConnectedPeripherals(withServices: [heartRateService]) {
      found[p.identifier] = (p, p.name ?? "Heart rate sensor", 0)
    }
    manager.scanForPeripherals(withServices: [heartRateService], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    queue.asyncAfter(deadline: .now() + max(1, min(seconds, 30))) { self.finishScan(error: nil) }
  }

  private func finishScan(error: String?) {
    guard let done = scanDone else { return }
    scanDone = nil
    if manager.isScanning { manager.stopScan() }
    let list = found.values
      .sorted { $0.rssi > $1.rssi }
      .map { ["id": $0.peripheral.identifier.uuidString, "name": $0.name, "rssi": $0.rssi] as [String: Any] }
    done(list, error)
  }

  func connect(id: String) {
    queue.async {
      guard let uuid = UUID(uuidString: id) else { return }
      self.wantedId = uuid
      self.connectWanted()
    }
  }

  private func connectWanted() {
    guard let uuid = wantedId, manager.state == .poweredOn else { return }
    guard let p = found[uuid]?.peripheral ?? manager.retrievePeripherals(withIdentifiers: [uuid]).first else {
      setState("notFound")
      return
    }
    peripheral = p
    p.delegate = self
    setState("connecting")
    manager.connect(p, options: nil)
  }

  func disconnect() {
    queue.async {
      self.wantedId = nil
      if let p = self.peripheral { self.manager.cancelPeripheralConnection(p) }
      self.peripheral = nil
      self.setState("idle")
    }
  }

  // MARK: CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      if let s = pendingScan { startScan(seconds: s) }
      connectWanted()
    case .poweredOff:
      setState("bluetoothOff")
      finishScan(error: "Bluetooth is off. Turn it on in Control Center.")
    case .unauthorized:
      setState("unauthorized")
      finishScan(error: "Forkbell isn't allowed to use Bluetooth. Turn it on in Settings → Forkbell.")
    case .unsupported:
      setState("unsupported")
      finishScan(error: "This device has no Bluetooth LE.")
    default:
      break
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? p.name ?? "Heart rate sensor"
    found[p.identifier] = (p, name, RSSI.intValue)
  }

  func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
    setState("connected")
    p.discoverServices([heartRateService])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    setState("disconnected")
    retry()
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    setState("disconnected")
    retry()
  }

  /// Out of range or the watch stopped broadcasting: try again in a few seconds, while still wanted.
  private func retry() {
    guard wantedId != nil else { return }
    queue.asyncAfter(deadline: .now() + 5) { self.connectWanted() }
  }

  // MARK: CBPeripheralDelegate

  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    for s in p.services ?? [] where s.uuid == heartRateService {
      p.discoverCharacteristics([heartRateMeasurement], for: s)
    }
  }

  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    for c in service.characteristics ?? [] where c.uuid == heartRateMeasurement {
      p.setNotifyValue(true, for: c)
    }
  }

  func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
    guard c.uuid == heartRateMeasurement, let data = c.value, data.count >= 2 else { return }
    let bytes = [UInt8](data)
    // Flags bit 0: the value is 16-bit, otherwise 8-bit.
    let bpm = (bytes[0] & 0x01) != 0 && bytes.count >= 3 ? Int(bytes[1]) | (Int(bytes[2]) << 8) : Int(bytes[1])
    guard bpm > 0 && bpm < 255 else { return }
    let reading: [String: Any] = ["bpm": bpm, "at": Date().timeIntervalSince1970 * 1000]
    latest = reading
    emit("onHeartRate", reading)
  }
}
