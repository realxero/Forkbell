// The LiDAR camera. One tap takes the photo and the scene depth map that lines
// up with it, both turned upright (portrait), and the camera's focal lengths
// and centre in depth-map pixels. JavaScript does the measuring
// (plateVolumes in packages/shared).
import ARKit
import CoreImage
import ExpoModulesCore
import SceneKit
import UIKit

public class ForkbellDepthModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForkbellDepth")

    Function("isSupported") { () -> Bool in
      ARWorldTrackingConfiguration.isSupported && ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    AsyncFunction("capture") { (promise: Promise) in
      guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
        promise.reject("ERR_NO_LIDAR", "This iPhone doesn’t have LiDAR.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW", "Couldn’t open the LiDAR camera.")
        return
      }
      let camera = DepthCaptureViewController()
      camera.modalPresentationStyle = .fullScreen
      camera.onFinish = { [weak camera] result in
        camera?.dismiss(animated: true) {
          switch result {
          case .cancelled: promise.resolve(nil)
          case .captured(let dict): promise.resolve(dict)
          case .failed(let message): promise.reject("ERR_CAPTURE", message)
          }
        }
      }
      presenter.present(camera, animated: true)
    }
    .runOnQueue(DispatchQueue.main)
  }
}

enum DepthCaptureResult {
  case cancelled
  case captured([String: Any])
  case failed(String)
}

final class DepthCaptureViewController: UIViewController, ARSessionDelegate {
  var onFinish: ((DepthCaptureResult) -> Void)?
  private let sceneView = ARSCNView()
  private let shutter = UIButton(type: .custom)
  private let closeButton = UIButton(type: .system)
  private let hint = UILabel()
  private var done = false

  override var prefersStatusBarHidden: Bool { true }
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    sceneView.frame = view.bounds
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.automaticallyUpdatesLighting = false
    sceneView.session.delegate = self
    view.addSubview(sceneView)

    hint.text = "Starting the LiDAR camera…"
    hint.textColor = .white
    hint.font = .systemFont(ofSize: 16, weight: .semibold)
    hint.textAlignment = .center
    hint.numberOfLines = 0
    hint.backgroundColor = UIColor.black.withAlphaComponent(0.45)
    hint.layer.cornerRadius = 12
    hint.clipsToBounds = true
    hint.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(hint)

    shutter.backgroundColor = .white
    shutter.layer.cornerRadius = 36
    shutter.layer.borderWidth = 5
    shutter.layer.borderColor = UIColor.white.withAlphaComponent(0.45).cgColor
    shutter.accessibilityLabel = "Measure"
    shutter.isEnabled = false
    shutter.alpha = 0.4
    shutter.addTarget(self, action: #selector(take), for: .touchUpInside)
    shutter.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(shutter)

    closeButton.setTitle("Cancel", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(closeButton)

    let g = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      hint.topAnchor.constraint(equalTo: g.topAnchor, constant: 16),
      hint.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 20),
      hint.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -20),
      hint.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      shutter.centerXAnchor.constraint(equalTo: g.centerXAnchor),
      shutter.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -24),
      shutter.widthAnchor.constraint(equalToConstant: 72),
      shutter.heightAnchor.constraint(equalToConstant: 72),
      closeButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 24),
      closeButton.centerYAnchor.constraint(equalTo: shutter.centerYAnchor),
    ])
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    let config = ARWorldTrackingConfiguration()
    var semantics: ARConfiguration.FrameSemantics = [.sceneDepth]
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) { semantics.insert(.smoothedSceneDepth) }
    config.frameSemantics = semantics
    config.planeDetection = [.horizontal]
    sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
  }

  // Ready once depth is coming in; the button waits until then.
  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    let ready = (frame.smoothedSceneDepth ?? frame.sceneDepth) != nil
    if ready && !shutter.isEnabled && !done {
      shutter.isEnabled = true
      shutter.alpha = 1
      hint.text = "Hold the phone flat above the plate, about 30–40 cm up, with table showing all around. Then tap."
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    finish(.failed("The LiDAR camera stopped: \(error.localizedDescription)"))
  }

  @objc private func cancel() {
    finish(.cancelled)
  }

  @objc private func take() {
    guard !done, let frame = sceneView.session.currentFrame, let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else {
      hint.text = "Hold still a moment…"
      return
    }
    shutter.isEnabled = false
    shutter.alpha = 0.4
    hint.text = "Measuring…"
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    let image = frame.capturedImage
    let intrinsics = frame.camera.intrinsics
    let depthMap = depth.depthMap
    let confidenceMap = depth.confidenceMap
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result = DepthCaptureViewController.package(image: image, intrinsics: intrinsics, depthMap: depthMap, confidenceMap: confidenceMap)
      DispatchQueue.main.async { self?.finish(result) }
    }
  }

  private func finish(_ result: DepthCaptureResult) {
    guard !done else { return }
    done = true
    onFinish?(result)
  }

  // MARK: - Packaging the shot

  /// Everything rotated a quarter turn clockwise, from the sensor's landscape to portrait.
  static func package(image: CVPixelBuffer, intrinsics: simd_float3x3, depthMap: CVPixelBuffer, confidenceMap: CVPixelBuffer?) -> DepthCaptureResult {
    let imageW = CVPixelBufferGetWidth(image)
    let imageH = CVPixelBufferGetHeight(image)

    // The photo: upright, at most 1280 px on the long side, as a JPEG data URI.
    var photo = CIImage(cvPixelBuffer: image).oriented(.right)
    photo = photo.transformed(by: CGAffineTransform(translationX: -photo.extent.origin.x, y: -photo.extent.origin.y))
    let scale = min(1, 1280 / max(photo.extent.width, photo.extent.height))
    photo = photo.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let context = CIContext()
    guard
      let space = CGColorSpace(name: CGColorSpace.sRGB),
      let jpeg = context.jpegRepresentation(of: photo, colorSpace: space, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.75])
    else { return .failed("Couldn’t save the photo.") }

    guard let depthPixels = readPixels(depthMap, Float32.self) else { return .failed("Couldn’t read the depth map.") }
    let (dw, dh, depth) = depthPixels
    let confidence = confidenceMap.flatMap { readPixels($0, UInt8.self) }

    // Focal lengths and centre: from photo pixels to depth pixels, then rotated with the map.
    let sx = Double(dw) / Double(imageW)
    let sy = Double(dh) / Double(imageH)
    let fx = Double(intrinsics[0][0]) * sx
    let fy = Double(intrinsics[1][1]) * sy
    let cx = Double(intrinsics[2][0]) * sx
    let cy = Double(intrinsics[2][1]) * sy

    var out: [String: Any] = [
      "image": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
      "imageWidth": Int(photo.extent.width.rounded()),
      "imageHeight": Int(photo.extent.height.rounded()),
      "depth": data(rotateClockwise(depth, dw, dh)).base64EncodedString(),
      "width": dh,
      "height": dw,
      "fx": fy,
      "fy": fx,
      "cx": Double(dh - 1) - cy,
      "cy": cx,
    ]
    if let c = confidence, c.0 == dw, c.1 == dh {
      out["confidence"] = data(rotateClockwise(c.2, dw, dh)).base64EncodedString()
    }
    return .captured(out)
  }

  static func readPixels<T>(_ buffer: CVPixelBuffer, _ type: T.Type) -> (Int, Int, [T])? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    let w = CVPixelBufferGetWidth(buffer)
    let h = CVPixelBufferGetHeight(buffer)
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    guard rowBytes >= w * MemoryLayout<T>.size else { return nil }
    var out = [T]()
    out.reserveCapacity(w * h)
    for y in 0..<h {
      let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: T.self)
      for x in 0..<w { out.append(row[x]) }
    }
    return (w, h, out)
  }

  /// w × h, row by row → h × w turned a quarter clockwise: (x, y) moves to (h − 1 − y, x).
  static func rotateClockwise<T>(_ src: [T], _ w: Int, _ h: Int) -> [T] {
    var out = src
    for y in 0..<h {
      for x in 0..<w { out[x * h + (h - 1 - y)] = src[y * w + x] }
    }
    return out
  }

  static func data<T>(_ values: [T]) -> Data {
    values.withUnsafeBufferPointer { Data(buffer: $0) }
  }
}
