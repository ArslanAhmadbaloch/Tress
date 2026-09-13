/**
 * Cuts the funnel's case-study photographs out of the delivered pairs.
 *
 * Each delivered file is a 1312x1199 side-by-side with a caption band
 * burned into the bottom of both halves ("Before / Thinner hair / …").
 * The card draws its own labels — in the app's type, in the app's
 * language — so the band is cropped away rather than shown twice, and
 * the seam down the middle is cut out with it.
 *
 * The crop is anchored to the top of the frame. These are photographs of
 * the top of a head; a centred crop of a portrait frame takes the hair
 * off the very picture whose subject is the hair.
 *
 * Usage:  swift scripts/case-studies.swift "<Male form folder>"
 */

import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
  FileHandle.standardError.write("usage: case-studies.swift <folder>\n".data(using: .utf8)!)
  exit(2)
}
let source = args[1]
let out = "assets/images"

/** Width of each half in the delivered pair, seam excluded. */
let HALF = 648
/** Where the right half starts, past the seam. */
let RIGHT_X = 664
/** Everything below this is the burned-in caption band. */
let KEEP_HEIGHT = 900
/** What the card actually needs, at 3x for a ~170pt tile. */
let OUT_WIDTH = 520
let QUALITY = 0.82

struct Pair {
  let file: String
  let name: String
}

let pairs: [Pair] = [
  Pair(file: "1", name: "case-daniel"),
  Pair(file: "2", name: "case-marco"),
]

func load(_ path: String) -> CGImage? {
  guard let data = NSData(contentsOfFile: path),
        let src = CGImageSourceCreateWithData(data, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func writeJPEG(_ image: CGImage, _ path: String) {
  guard let dest = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: path) as CFURL, "public.jpeg" as CFString, 1, nil
  ) else { exit(1) }
  CGImageDestinationAddImage(
    dest, image, [kCGImageDestinationLossyCompressionQuality: QUALITY] as CFDictionary
  )
  guard CGImageDestinationFinalize(dest) else { exit(1) }
  let bytes = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int)
    .flatMap { $0 } ?? 0
  print("  \(path)  \(image.width)x\(image.height)  \(bytes / 1024)KB")
}

func resized(_ image: CGImage, width: Int) -> CGImage? {
  let height = Int((CGFloat(width) * CGFloat(image.height) / CGFloat(image.width)).rounded())
  guard let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return ctx.makeImage()
}

print("Cutting the case-study pairs…")

for pair in pairs {
  guard let image = load("\(source)/\(pair.file).png") else {
    FileHandle.standardError.write("missing \(pair.file).png\n".data(using: .utf8)!)
    exit(1)
  }

  // CoreGraphics counts y from the top, which is the edge being kept.
  let halves = [("before", 0), ("after", RIGHT_X)]
  for (side, x) in halves {
    guard let half = image.cropping(
            to: CGRect(x: x, y: 0, width: HALF, height: KEEP_HEIGHT)),
          let sized = resized(half, width: OUT_WIDTH) else { exit(1) }
    writeJPEG(sized, "\(out)/\(pair.name)-\(side).jpg")
  }
}
