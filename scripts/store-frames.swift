/**
 * Composes App Store frames in the "hero" style: a headline on a soft
 * ground, the device floating below it, and one real element from the
 * screen pulled out, enlarged and floated off the frame.
 *
 * The pull-out is the whole trick. A phone screenshot at store size is
 * too small to read, so the thing the frame is actually about gets
 * lifted out of it and shown at a size somebody scrolling can take in.
 * It is a crop of the real screenshot, not a redrawn mock: the rule this
 * script exists to keep is that every pixel came from the app.
 *
 * Usage:  swift scripts/store-frames.swift <manifest.json> <out-dir>
 *
 * Manifest: [{ "shot", "out", "line1", "line2", "sub",
 *              "pull": {"x","y","w","h","at","scale"} }]
 * `at` is "left" or "right"; `pull` may be omitted.
 */

import AppKit
import CoreText

let args = CommandLine.arguments
guard args.count > 2 else {
  FileHandle.standardError.write("usage: store-frames.swift <manifest.json> <out-dir>\n".data(using: .utf8)!)
  exit(2)
}

let W = 1290, H = 2796
let MARGIN: CGFloat = 96

// From src/theme/tokens.ts. Copied rather than imported: this runs where
// there is no bundler, and these four have not changed since launch.
let IVORY = NSColor(red: 0.941, green: 0.933, blue: 0.914, alpha: 1)  // #F0EEE9
let SAGE50 = NSColor(red: 0.945, green: 0.965, blue: 0.937, alpha: 1) // #F1F6EF
let INK = NSColor(red: 0.051, green: 0.055, blue: 0.063, alpha: 1)    // #0D0E10
let STONE = NSColor(red: 0.443, green: 0.451, blue: 0.435, alpha: 1)  // #71736F
let WHITE = NSColor.white

struct Pull: Decodable { let x: CGFloat; let y: CGFloat; let w: CGFloat; let h: CGFloat; let at: String; let scale: CGFloat }

/**
 * A decorative object floated over the frame — a product bottle, say.
 *
 * Deliberately never UI. Anything that looks like part of the app has to
 * be a crop of a real screenshot (that is what `Pull` is for); this is
 * for objects that are plainly photography and could not be mistaken for
 * a feature. `cx`/`cy` are fractions of the frame, `w` a fraction of its
 * width, so a manifest does not carry pixel coordinates.
 */
struct FloatItem: Decodable { let image: String; let cx: CGFloat; let cy: CGFloat; let w: CGFloat }
struct Frame: Decodable {
  let shot: String; let out: String
  let line1: String; let line2: String; let sub: String?
  let pull: Pull?
  let float: FloatItem?
}

func registerFont(_ path: String) {
  var error: Unmanaged<CFError>?
  CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: path) as CFURL, .process, &error)
}
registerFont("node_modules/@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf")
registerFont("node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf")

func font(_ n: String, _ s: CGFloat) -> NSFont {
  guard let f = NSFont(name: n, size: s) else { exit(1) }
  return f
}

func text(_ s: String, _ f: NSFont, _ c: NSColor, tracking: CGFloat, leading: CGFloat) -> NSAttributedString {
  let p = NSMutableParagraphStyle()
  p.minimumLineHeight = leading; p.maximumLineHeight = leading
  p.alignment = .center; p.lineBreakMode = .byWordWrapping
  return NSAttributedString(string: s, attributes: [
    .font: f, .foregroundColor: c, .kern: tracking, .paragraphStyle: p,
  ])
}

func load(_ p: String) -> NSImage {
  guard let i = NSImage(contentsOfFile: p) else {
    FileHandle.standardError.write("cannot read \(p)\n".data(using: .utf8)!); exit(1)
  }
  return i
}


/**
 * Paints out Expo Go's dev-menu button.
 *
 * It is a saturated blue disc that a development build floats over the
 * app, and it has no business in a store frame. Rather than hand-placing
 * a patch per screenshot, it is found by colour — nothing in this app's
 * cream-and-sage palette comes near that blue — and filled by cloning
 * the nearest pixel outside the disc on the same row. The disc is small
 * and the rows behind it are close to uniform at this scale, so a
 * horizontal clone disappears where a flat fill would read as a smudge.
 *
 * Production builds have no dev menu, so this is only ever needed for
 * frames shot against a development client.
 */
func removeDevBadge(_ image: CGImage) -> CGImage {
  let w = image.width, h = image.height
  let space = CGColorSpaceCreateDeviceRGB()
  let bpr = w * 4
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: bpr,
                            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
        let raw = ctx.data else { return image }
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  let px = raw.bindMemory(to: UInt8.self, capacity: bpr * h)

  func isBadgeBlue(_ i: Int) -> Bool {
    let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
    // The dev badge sits around #0A84FF: blue dominant, and far enough
    // from both other channels that no photographed hair reaches it.
    return b > 150 && b - r > 60 && b - g > 40
  }

  /*
    A centroid and a radius, not a bounding box. The first version took
    the extent of every blue-ish pixel in the frame, and a handful of
    anti-aliased stragglers stretched the patch into a full-width band
    straight through the headline. The badge is one small disc, so it is
    described as one: the middle of the blue, and a radius from how much
    of it there is.
  */
  var sumX = 0, sumY = 0, count = 0
  for y in 0..<h {
    for x in 0..<w where isBadgeBlue(y * bpr + x * 4) {
      sumX += x; sumY += y; count += 1
    }
  }
  guard count > 400 else { return image }
  let cx = sumX / count, cy = sumY / count
  // area = pi r^2, with a little margin for the shadow around it.
  let r = Int(Double(count).squareRoot() / Double.pi.squareRoot() * 1.45) + 4

  for y in max(0, cy - r)...min(h - 1, cy + r) {
    let row = y * bpr
    let dy = y - cy
    let half = Int((Double(r * r - dy * dy)).squareRoot())
    if half <= 0 { continue }
    let x0 = max(0, cx - half), x1 = min(w - 1, cx + half)
    let leftX = max(0, x0 - 1), rightX = min(w - 1, x1 + 1)
    for x in x0...x1 {
      // Clone from the nearer edge so a gradient keeps running through.
      let src = (x - x0) < (x1 - x) ? leftX : rightX
      for c in 0..<4 { px[row + x * 4 + c] = px[row + src * 4 + c] }
    }
  }
  return ctx.makeImage() ?? image
}

func compose(_ f: Frame, into dir: String) {
  let space = CGColorSpaceCreateDeviceRGB()
  guard let cg = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                           space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }
  cg.interpolationQuality = .high
  cg.translateBy(x: 0, y: CGFloat(H)); cg.scaleBy(x: 1, y: -1)
  let gc = NSGraphicsContext(cgContext: cg, flipped: true)
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = gc

  // The ground: near-white at the top so the headline sits in air, warming
  // into the app's own ivory at the bottom so the device belongs to it.
  if let grad = NSGradient(colors: [WHITE, WHITE, SAGE50, IVORY],
                           atLocations: [0.0, 0.46, 0.84, 1.0], colorSpace: .deviceRGB) {
    grad.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)
  }

  // Headline, two-tone: the claim in ink, the qualifier in stone. Lifted
  // from how the app's own titles work (ScreenTitle's title/titleMuted).
  let column = NSRect(x: MARGIN, y: 196, width: CGFloat(W) - MARGIN * 2, height: 520)
  let l1 = text(f.line1, font("Manrope-SemiBold", 92), INK, tracking: -2.4, leading: 104)
  l1.draw(with: column, options: [.usesLineFragmentOrigin])
  let used1 = l1.boundingRect(with: NSSize(width: column.width, height: 520), options: [.usesLineFragmentOrigin])

  let l2 = text(f.line2, font("Manrope-SemiBold", 92), STONE, tracking: -2.4, leading: 104)
  let r2 = NSRect(x: column.minX, y: column.minY + ceil(used1.height), width: column.width, height: 320)
  l2.draw(with: r2, options: [.usesLineFragmentOrigin])
  let used2 = l2.boundingRect(with: NSSize(width: column.width, height: 320), options: [.usesLineFragmentOrigin])

  var deviceTop: CGFloat = column.minY + ceil(used1.height) + ceil(used2.height) + 56
  if let sub = f.sub, !sub.isEmpty {
    let s = text(sub, font("Manrope-Medium", 38), STONE, tracking: -0.3, leading: 50)
    let rs = NSRect(x: column.minX + 40, y: deviceTop, width: column.width - 80, height: 140)
    s.draw(with: rs, options: [.usesLineFragmentOrigin])
    deviceTop += ceil(s.boundingRect(with: NSSize(width: column.width - 80, height: 140),
                                     options: [.usesLineFragmentOrigin]).height) + 44
  }

  // The device. Runs off the bottom edge: a phone, not a card.
  let rawShot = load(f.shot)
  let shot: NSImage = {
    guard let c = rawShot.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return rawShot }
    let cleaned = removeDevBadge(c)
    return NSImage(cgImage: cleaned, size: rawShot.size)
  }()
  let dW: CGFloat = 1000
  let scale = dW / shot.size.width
  let dRect = NSRect(x: (CGFloat(W) - dW) / 2, y: deviceTop, width: dW, height: shot.size.height * scale)
  let path = NSBezierPath(roundedRect: dRect, xRadius: 64, yRadius: 64)

  // A wide, faint pool of light behind the phone. Without it the device
  // reads as pasted onto the gradient; with it the gradient looks lit.
  if let glow = NSGradient(starting: SAGE50.withAlphaComponent(0.40),
                           ending: IVORY.withAlphaComponent(0.0)) {
    let g = dRect.insetBy(dx: -200, dy: -150)
    glow.draw(in: g, relativeCenterPosition: NSPoint(x: 0, y: 0.25))
  }

  cg.saveGState()
  cg.setShadow(offset: CGSize(width: 0, height: -30), blur: 80, color: INK.withAlphaComponent(0.16).cgColor)
  WHITE.setFill(); path.fill()
  cg.restoreGState()

  cg.saveGState(); path.addClip()
  shot.draw(in: dRect, from: .zero, operation: .sourceOver, fraction: 1,
            respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  cg.restoreGState()

  // The rim. A screenshot has no edge; a phone does.
  cg.saveGState()
  WHITE.withAlphaComponent(0.9).setStroke()
  path.lineWidth = 3
  path.stroke()
  INK.withAlphaComponent(0.06).setStroke()
  let inner = NSBezierPath(roundedRect: dRect.insetBy(dx: 1.5, dy: 1.5), xRadius: 62.5, yRadius: 62.5)
  inner.lineWidth = 1
  inner.stroke()
  cg.restoreGState()

  // The pull-out: a crop of the very same screenshot, enlarged and floated
  // half off the device so the eye reads it as lifted from the screen.
  if let p = f.pull, let cgShot = shot.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let crop = CGRect(x: p.x, y: p.y, width: p.w, height: p.h)
    if let piece = cgShot.cropping(to: crop) {
      let pw = p.w * scale * p.scale, ph = p.h * scale * p.scale
      let px = p.at == "left" ? dRect.minX - 64 : dRect.maxX + 64 - pw
      let py = dRect.minY + dRect.height * 0.60
      let pr = NSRect(x: px, y: py, width: pw, height: ph)
      let pp = NSBezierPath(roundedRect: pr, xRadius: 28, yRadius: 28)
      cg.saveGState()
      cg.setShadow(offset: CGSize(width: 0, height: -14), blur: 44, color: INK.withAlphaComponent(0.22).cgColor)
      WHITE.setFill(); pp.fill()
      cg.restoreGState()
      /*
        Drawn through NSImage rather than cg.draw, because this context is
        flipped for AppKit's text and a raw CGImage lands upside down in
        it — which is exactly what the first version of this script did.
      */
      cg.saveGState()
      pp.addClip()
      NSImage(cgImage: piece, size: NSSize(width: p.w, height: p.h))
        .draw(in: pr, from: .zero, operation: .sourceOver, fraction: 1,
              respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
      cg.restoreGState()
    }
  }

  if let fl = f.float {
    let img = load(fl.image)
    let fw = CGFloat(W) * fl.w
    let fh = fw * (img.size.height / img.size.width)
    let fr = NSRect(x: CGFloat(W) * fl.cx - fw / 2, y: CGFloat(H) * fl.cy - fh / 2, width: fw, height: fh)
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -22), blur: 60, color: INK.withAlphaComponent(0.28).cgColor)
    img.draw(in: fr, from: .zero, operation: .sourceOver, fraction: 1,
             respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    cg.restoreGState()
  }

  NSGraphicsContext.restoreGraphicsState()
  guard let image = cg.makeImage() else { exit(1) }
  let out = (dir as NSString).appendingPathComponent(f.out)
  guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, "public.png" as CFString, 1, nil)
  else { exit(1) }
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { exit(1) }
  print("  \(out)  \(image.width)x\(image.height)")
}

let data = FileManager.default.contents(atPath: args[1]) ?? Data()
guard let frames = try? JSONDecoder().decode([Frame].self, from: data), !frames.isEmpty else {
  FileHandle.standardError.write("manifest is not a non-empty array\n".data(using: .utf8)!); exit(1)
}
try? FileManager.default.createDirectory(atPath: args[2], withIntermediateDirectories: true)
print("Composing \(frames.count) frames…")
for f in frames { compose(f, into: args[2]) }
