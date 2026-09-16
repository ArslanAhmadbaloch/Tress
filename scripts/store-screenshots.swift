/**
 * Composes App Store / Play screenshots from raw simulator captures.
 *
 * Each frame is a headline on the app's ivory ground with the device
 * screenshot below it, rounded and softly shadowed, bleeding off the
 * bottom edge — the "band and bleed" the listing has used since its first
 * submission. Copy comes from a manifest so the words live beside the
 * pictures they caption, and so re-shooting after a redesign is one
 * command rather than an afternoon.
 *
 * Output is 1290×2796, the 6.7" size App Store Connect accepts for every
 * current iPhone slot and Play scales without complaint.
 *
 * Usage:  swift scripts/store-screenshots.swift <manifest.json> <out-dir>
 *
 * Manifest: [{ "shot": "path/to/capture.png", "out": "01-report.png",
 *              "headline": "…", "subline": "…" }, …]
 * Captures are expected at iPhone 17 Pro size (1206×2622); other portrait
 * sizes are scaled to the same width.
 */

import AppKit
import CoreText

let args = CommandLine.arguments
guard args.count > 2 else {
  FileHandle.standardError.write("usage: store-screenshots.swift <manifest.json> <out-dir>\n".data(using: .utf8)!)
  exit(2)
}

let W = 1290, H = 2796
/// The margin the type and the device share, so they read as one column.
let MARGIN: CGFloat = 96
/// Where the device begins; the headline block owns everything above it.
let DEVICE_TOP: CGFloat = 640
let DEVICE_WIDTH: CGFloat = 1098
let DEVICE_RADIUS: CGFloat = 72

// The palette, copied from src/theme/tokens.ts rather than imported: this
// script runs where there is no bundler, and these four do not change.
let IVORY = NSColor(red: 0.941, green: 0.933, blue: 0.914, alpha: 1)   // #F0EEE9
let INK = NSColor(red: 0.051, green: 0.055, blue: 0.063, alpha: 1)     // #0D0E10
let STONE = NSColor(red: 0.443, green: 0.451, blue: 0.435, alpha: 1)   // #71736F
let SAGE = NSColor(red: 0.431, green: 0.561, blue: 0.388, alpha: 1)    // #6E8F63

struct Frame: Decodable {
  let shot: String
  let out: String
  let headline: String
  let subline: String
}

func registerFont(_ path: String) {
  let url = URL(fileURLWithPath: path) as CFURL
  var error: Unmanaged<CFError>?
  if !CTFontManagerRegisterFontsForURL(url, .process, &error) {
    // Already registered in this process is fine; anything else is not.
    let description = error.map { String(describing: $0.takeRetainedValue()) } ?? "unknown"
    if !description.contains("already") {
      FileHandle.standardError.write("cannot register \(path): \(description)\n".data(using: .utf8)!)
    }
  }
}

registerFont("node_modules/@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf")
registerFont("node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf")

func font(_ name: String, _ size: CGFloat) -> NSFont {
  guard let f = NSFont(name: name, size: size) else {
    FileHandle.standardError.write("font \(name) not available\n".data(using: .utf8)!)
    exit(1)
  }
  return f
}

func load(_ path: String) -> NSImage {
  guard let image = NSImage(contentsOfFile: path) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
    exit(1)
  }
  return image
}

func attributed(_ text: String, font: NSFont, color: NSColor, tracking: CGFloat, leading: CGFloat) -> NSAttributedString {
  let paragraph = NSMutableParagraphStyle()
  paragraph.minimumLineHeight = leading
  paragraph.maximumLineHeight = leading
  paragraph.lineBreakMode = .byWordWrapping
  return NSAttributedString(string: text, attributes: [
    .font: font, .foregroundColor: color, .kern: tracking, .paragraphStyle: paragraph,
  ])
}

func compose(_ frame: Frame, into dir: String) {
  // A bitmap of exactly the output size. Drawing into an NSImage would
  // pick up the display's backing scale and hand back a 2× file.
  let space = CGColorSpaceCreateDeviceRGB()
  guard let cg = CGContext(
    data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
    space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { exit(1) }
  cg.interpolationQuality = .high
  // AppKit's flipped drawing expects the CTM already turned over.
  cg.translateBy(x: 0, y: CGFloat(H))
  cg.scaleBy(x: 1, y: -1)
  let gc = NSGraphicsContext(cgContext: cg, flipped: true)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = gc

  IVORY.setFill()
  NSRect(x: 0, y: 0, width: W, height: H).fill()

  // Headline block. The eyebrow is the one accent on the frame; the
  // headline carries the message; the subline says what is on screen.
  let column = NSRect(x: MARGIN, y: 168, width: CGFloat(W) - MARGIN * 2, height: DEVICE_TOP - 168)
  let eyebrow = attributed("TRESS", font: font("Manrope-SemiBold", 34), color: SAGE, tracking: 7, leading: 40)
  eyebrow.draw(with: column, options: [.usesLineFragmentOrigin])

  let headline = attributed(frame.headline, font: font("Manrope-SemiBold", 96), color: INK, tracking: -2.6, leading: 106)
  let headlineRect = NSRect(x: column.minX, y: column.minY + 72, width: column.width, height: 340)
  headline.draw(with: headlineRect, options: [.usesLineFragmentOrigin])
  let used = headline.boundingRect(with: NSSize(width: column.width, height: 340), options: [.usesLineFragmentOrigin])

  let subline = attributed(frame.subline, font: font("Manrope-Medium", 40), color: STONE, tracking: -0.4, leading: 52)
  let sublineRect = NSRect(x: column.minX, y: headlineRect.minY + ceil(used.height) + 28, width: column.width, height: 160)
  subline.draw(with: sublineRect, options: [.usesLineFragmentOrigin])

  // The device: scaled to the column, rounded, shadowed, and running off
  // the bottom so the eye reads it as a phone rather than a card.
  let shot = load(frame.shot)
  let scale = DEVICE_WIDTH / shot.size.width
  let deviceRect = NSRect(x: (CGFloat(W) - DEVICE_WIDTH) / 2, y: DEVICE_TOP, width: DEVICE_WIDTH, height: shot.size.height * scale)
  let path = NSBezierPath(roundedRect: deviceRect, xRadius: DEVICE_RADIUS, yRadius: DEVICE_RADIUS)

  cg.saveGState()
  cg.setShadow(offset: CGSize(width: 0, height: -28), blur: 90, color: INK.withAlphaComponent(0.18).cgColor)
  IVORY.setFill()
  path.fill()
  cg.restoreGState()

  cg.saveGState()
  path.addClip()
  shot.draw(in: deviceRect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  cg.restoreGState()

  NSGraphicsContext.restoreGraphicsState()

  guard let image = cg.makeImage() else { exit(1) }
  let out = (dir as NSString).appendingPathComponent(frame.out)
  let url = URL(fileURLWithPath: out)
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { exit(1) }
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { exit(1) }
  print("  \(out)  \(image.width)x\(image.height)")
}

let manifestData = FileManager.default.contents(atPath: args[1]) ?? Data()
guard let frames = try? JSONDecoder().decode([Frame].self, from: manifestData), !frames.isEmpty else {
  FileHandle.standardError.write("manifest \(args[1]) is not a non-empty array of frames\n".data(using: .utf8)!)
  exit(1)
}
try? FileManager.default.createDirectory(atPath: args[2], withIntermediateDirectories: true)
print("Composing \(frames.count) store screenshots…")
for frame in frames { compose(frame, into: args[2]) }
