/**
 * Cuts the app icons out of the delivered logo render.
 *
 * The logo arrives as a lit, embossed squircle photographed on a pale
 * field with a soft drop shadow — it is a picture of an app icon rather
 * than an app icon. Three things have to be taken off it before iOS will
 * accept it: the shadow, the paper around the tile, and the tile's own
 * rounded corners, because the OS rounds the corners itself and an icon
 * that arrives pre-rounded gets a second, visible rounding.
 *
 * So the crop sits inside the tile face. Its bounds were measured once on
 * the 1254px render and are recorded here: the tile spans 930px from
 * (173, 161), and insetting 30px on each side clears the corner curve
 * while leaving the mark room to breathe.
 *
 * Usage:  swift scripts/app-icon.swift "<App Logo.png>"
 */

import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
  FileHandle.standardError.write("usage: app-icon.swift <App Logo.png>\n".data(using: .utf8)!)
  exit(2)
}

/// The tile face on the 1254px render, inset past its own rounded corners.
let CROP = CGRect(x: 203, y: 191, width: 870, height: 870)

/// Flat stand-in for the tile, for the Android adaptive background. Sampled
/// from the render itself so the foreground artwork sits on it seamlessly.
let TILE = CGColor(red: 0.957, green: 0.949, blue: 0.937, alpha: 1)

/// Android keeps only the middle 66% of an adaptive icon; the rest can be
/// cropped to a circle, a squircle or a rounded square by the launcher.
let ANDROID_SAFE: CGFloat = 0.66

func load(_ path: String) -> CGImage {
  guard let data = NSData(contentsOfFile: path),
        let source = CGImageSourceCreateWithData(data, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
    exit(1)
  }
  return image
}

func context(_ size: Int, opaque: Bool) -> CGContext {
  let space = CGColorSpaceCreateDeviceRGB()
  let info: CGImageAlphaInfo = opaque ? .noneSkipLast : .premultipliedLast
  guard let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: space, bitmapInfo: info.rawValue
  ) else { exit(1) }
  ctx.interpolationQuality = .high
  return ctx
}

func write(_ image: CGImage, to path: String) {
  let url = URL(fileURLWithPath: path)
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)
  else { exit(1) }
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { exit(1) }
  print("  \(path)  \(image.width)x\(image.height)")
}

let source = load(args[1])
guard let face = source.cropping(to: CROP) else { exit(1) }

print("Generating Tress icons…")

// iOS: full-bleed, opaque, square. The OS applies its own mask, so this
// file must carry no transparency and no rounding of its own.
do {
  let ctx = context(1024, opaque: true)
  ctx.draw(face, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
  write(ctx.makeImage()!, to: "assets/images/icon.png")
}

// Web favicon, from the same face.
do {
  let ctx = context(48, opaque: true)
  ctx.draw(face, in: CGRect(x: 0, y: 0, width: 48, height: 48))
  write(ctx.makeImage()!, to: "assets/images/favicon.png")
}

// Android adaptive: a flat tile behind, the artwork inside the safe zone.
// The artwork's own ground is the same near-white as the background, so
// the two meet without a seam whatever shape the launcher masks to.
do {
  let ctx = context(1024, opaque: true)
  ctx.setFillColor(TILE)
  ctx.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
  write(ctx.makeImage()!, to: "assets/images/android-icon-background.png")
}

do {
  let ctx = context(1024, opaque: false)
  let inset = 1024 * (1 - ANDROID_SAFE) / 2
  ctx.draw(face, in: CGRect(x: inset, y: inset, width: 1024 * ANDROID_SAFE, height: 1024 * ANDROID_SAFE))
  write(ctx.makeImage()!, to: "assets/images/android-icon-foreground.png")
}

// A preview masked the way iOS masks it, so the corners can be checked
// before anybody waits on a build to find out.
do {
  let ctx = context(1024, opaque: false)
  let rect = CGRect(x: 0, y: 0, width: 1024, height: 1024)
  let path = CGPath(roundedRect: rect, cornerWidth: 1024 * 0.2237, cornerHeight: 1024 * 0.2237, transform: nil)
  ctx.addPath(path)
  ctx.clip()
  ctx.draw(face, in: rect)
  write(ctx.makeImage()!, to: "/tmp/hair-journey-icon-masked.png")
}
