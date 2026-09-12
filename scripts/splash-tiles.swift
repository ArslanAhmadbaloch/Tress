// Cuts the splash composition into the pieces the launch animation reveals.
//
// The design arrives as two renders at the same size: an empty plate and
// the finished lockup. The mark and the wordmark are drawn over the plate
// with soft white shadows and a near-white circle, so there is no colour
// to key out — an alpha cut would take the circle with it.
//
// So each piece is lifted as a rectangle of the finished render and laid
// back over the plate at exactly the coordinates it came from. Two things
// make the seam disappear:
//
//   1. The two renders are not pixel-identical (mean mismatch around 8/255
//      in these regions), so each tile's background is levelled to the
//      plate's, measured on a border ring that contains no artwork.
//   2. The tile's edges feather to transparent, turning whatever mismatch
//      survives into a gradient far too gradual to see.
//
// Usage: swift scripts/splash-tiles.swift <plate.png> <lockup.png> <outDir>

import Foundation
import CoreGraphics
import AppKit

/** Transparent margin around the artwork, and how far the edge feathers. */
let MARGIN = 54
let FEATHER = 46
/** Ring at the tile's edge used to measure the background level. */
let RING = 22
/** A pixel differing by more than this between renders is artwork. */
let ARTWORK = 40

struct Band {
    let name: String
    let top: Int
    let bottom: Int
}

/** Vertical extents of each piece, read off the difference of the renders. */
let BANDS = [
    Band(name: "splash-emblem", top: 575, bottom: 935),
    Band(name: "splash-wordmark", top: 955, bottom: 1082),
    Band(name: "splash-tagline", top: 1120, bottom: 1210),
]

/** The right edge of the plate differs between renders; stay clear of it. */
let SEARCH_X = 140...700

let args = CommandLine.arguments
guard args.count >= 4,
      let plateImg = NSImage(contentsOfFile: args[1])?.cgImage(forProposedRect: nil, context: nil, hints: nil),
      let lockupImg = NSImage(contentsOfFile: args[2])?.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { fatalError("usage: splash-tiles.swift <plate.png> <lockup.png> <outDir>") }

let outDir = args[3]
let w = plateImg.width, h = plateImg.height
precondition(w == lockupImg.width && h == lockupImg.height, "renders differ in size")

func pixels(_ img: CGImage) -> [UInt8] {
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let cs = CGColorSpaceCreateDeviceRGB()
    buf.withUnsafeMutableBytes { raw in
        let ctx = CGContext(data: raw.baseAddress, width: w, height: h,
                            bitsPerComponent: 8, bytesPerRow: w * 4, space: cs,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    return buf
}

let plate = pixels(plateImg)
let lockup = pixels(lockupImg)

func channelDiff(_ i: Int) -> Int {
    max(abs(Int(plate[i]) - Int(lockup[i])),
        max(abs(Int(plate[i + 1]) - Int(lockup[i + 1])),
            abs(Int(plate[i + 2]) - Int(lockup[i + 2]))))
}

/** Smoothstep, so the feather has no visible start or end. */
func smooth(_ t: Double) -> Double {
    let c = min(1, max(0, t))
    return c * c * (3 - 2 * c)
}

print("plate \(w)x\(h)")

for band in BANDS {
    // Tight horizontal extent of the artwork in this band.
    var left = SEARCH_X.upperBound, right = SEARCH_X.lowerBound
    for y in band.top...band.bottom {
        for x in SEARCH_X where channelDiff((y * w + x) * 4) > 90 {
            left = min(left, x)
            right = max(right, x)
        }
    }

    let x0 = max(0, left - MARGIN)
    let y0 = max(0, band.top - MARGIN)
    let x1 = min(w - 1, right + MARGIN)
    let y1 = min(h - 1, band.bottom + MARGIN)
    let tw = x1 - x0 + 1
    let th = y1 - y0 + 1

    // Level the tile to the plate, measured on background-only pixels in
    // the border ring — inside the ring is artwork, which must not shift.
    var sum = [0.0, 0.0, 0.0]
    var samples = 0.0
    for y in y0...y1 {
        for x in x0...x1 {
            let onRing = x < x0 + RING || x > x1 - RING || y < y0 + RING || y > y1 - RING
            guard onRing else { continue }
            let i = (y * w + x) * 4
            guard channelDiff(i) <= ARTWORK else { continue }
            for c in 0..<3 { sum[c] += Double(plate[i + c]) - Double(lockup[i + c]) }
            samples += 1
        }
    }
    let offset = samples > 0 ? sum.map { $0 / samples } : [0, 0, 0]

    var out = [UInt8](repeating: 0, count: tw * th * 4)
    for ty in 0..<th {
        for tx in 0..<tw {
            let src = ((y0 + ty) * w + (x0 + tx)) * 4
            let dst = (ty * tw + tx) * 4

            let edge = Double(min(min(tx, tw - 1 - tx), min(ty, th - 1 - ty)))
            let alpha = smooth(edge / Double(FEATHER))

            for c in 0..<3 {
                let levelled = Double(lockup[src + c]) + offset[c]
                // Premultiplied, which is what CGImage expects here.
                out[dst + c] = UInt8(min(255, max(0, (levelled * alpha).rounded())))
            }
            out[dst + 3] = UInt8((alpha * 255).rounded())
        }
    }

    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: &out, width: tw, height: th, bitsPerComponent: 8,
                        bytesPerRow: tw * 4, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let image = ctx.makeImage()!

    let url = URL(fileURLWithPath: "\(outDir)/\(band.name).png")
    let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)

    // Fractions of the plate, so the app can place the tile on any screen.
    let fx = Double(x0) / Double(w)
    let fy = Double(y0) / Double(h)
    let fw = Double(tw) / Double(w)
    print(String(format: "%@  %dx%d at (%d,%d)  left %.5f top %.5f width %.5f  level %.1f/%.1f/%.1f",
                 band.name, tw, th, x0, y0, fx, fy, fw, offset[0], offset[1], offset[2]))
}
