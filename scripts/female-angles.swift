/**
 * Cuts the female reference set out of the delivered renders.
 *
 * The male angles are 1080 square and the progress pair is a wide crop;
 * the delivered female frames are 1086x1448 portraits and a 1312x1199
 * pair, so they have to be brought to the same shape or they will crop
 * differently inside containers the male ones already fit.
 *
 * Square crops are anchored per image rather than centred. A centred crop
 * of a portrait frame cuts the top of the head off the very angles whose
 * subject is the top of the head, so each one carries its own vertical
 * anchor: 0 keeps the top of the frame, 1 keeps the bottom.
 *
 * Usage:  swift scripts/female-angles.swift "<Girl Angles folder>"
 */

import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
  FileHandle.standardError.write("usage: female-angles.swift <folder>\n".data(using: .utf8)!)
  exit(2)
}
let source = args[1]
let out = "assets/images"

/** Square references, sized to match the male set. */
let SQUARE = 1080
/** The progress pair, which the card crops to its own aspect. */
let PROGRESS_WIDTH = 800
let QUALITY = 0.82

struct Job {
  let file: String
  let name: String
  /** 0 keeps the top of the frame, 1 the bottom. */
  let anchor: CGFloat
}

let angles: [Job] = [
  Job(file: "1", name: "female-portrait", anchor: 0.18),
  Job(file: "2", name: "female-angle-top", anchor: 0.10),
  Job(file: "3", name: "female-angle-left", anchor: 0.14),
  Job(file: "4", name: "female-angle-right", anchor: 0.14),
  Job(file: "5", name: "female-angle-crown", anchor: 0.20),
  Job(file: "6", name: "female-angle-front", anchor: 0.30),
]

func load(_ path: String) -> CGImage? {
  guard let data = NSData(contentsOfFile: path),
        let src = CGImageSourceCreateWithData(data, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func writeJPEG(_ image: CGImage, _ path: String) {
  guard let dest = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: path) as CFURL, "public.jpeg" as CFString, 1, nil
  ) else { return }
  CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: QUALITY] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { return }
  let kb = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int).flatMap { $0 } ?? 0
  print("  \(path)  \(image.width)x\(image.height)  \(kb / 1024)KB")
}

func scaled(_ image: CGImage, to size: Int) -> CGImage? {
  guard let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
  return ctx.makeImage()
}

print("Cutting the female reference set…")

for job in angles {
  guard let image = load("\(source)/\(job.file).png") else {
    FileHandle.standardError.write("missing \(job.file).png\n".data(using: .utf8)!)
    exit(1)
  }
  let side = min(image.width, image.height)
  // CoreGraphics counts y from the top for cropping.
  let y = Int((CGFloat(image.height - side) * job.anchor).rounded())
  let x = (image.width - side) / 2
  guard let square = image.cropping(to: CGRect(x: x, y: y, width: side, height: side)),
        let sized = scaled(square, to: SQUARE) else { exit(1) }
  writeJPEG(sized, "\(out)/\(job.name).jpg")
}

for (file, name) in [("Before", "female-example-before"), ("After", "female-example-after")] {
  guard let image = load("\(source)/\(file).png") else { exit(1) }
  let height = Int((CGFloat(PROGRESS_WIDTH) * CGFloat(image.height) / CGFloat(image.width)).rounded())
  guard let ctx = CGContext(
    data: nil, width: PROGRESS_WIDTH, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { exit(1) }
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: PROGRESS_WIDTH, height: height))
  guard let sized = ctx.makeImage() else { exit(1) }
  writeJPEG(sized, "\(out)/\(name).jpg")
}
