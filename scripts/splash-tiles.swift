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
//      plate's by fitting a plane through the mismatch on the background
//      pixels — a plane rather than an average, because the plate carries
//      a gradient here and one number leaves the tile's middle a shade off.
//   2. The tile's edges feather to transparent, turning whatever mismatch
//      survives into a gradient far too gradual to see.
//
// Usage: swift scripts/splash-tiles.swift <plate.png> <lockup.png> <outDir>

import Foundation
import CoreGraphics
import AppKit

/** The furthest an edge ever feathers, however wide its margin. */
let FEATHER = 46
/** A pixel differing by more than this between renders is artwork. */
let ARTWORK = 40

struct Band {
    let name: String
    let top: Int
    let bottom: Int
    /**
     * Margins per edge. Wide wherever the tile has the plate to itself,
     * and narrow where the next piece begins: a wide feather reaches far
     * enough to carry a faint ghost of its neighbour's artwork, which
     * would bring two pieces up on one beat. The narrow edges are placed
     * in the blank leading between lines, where the plate is at its most
     * even and a short feather has nothing to give away.
     */
    let marginX: Int
    let marginTop: Int
    let marginBottom: Int
}

/**
 * Vertical extents of each piece, read off the difference of the renders.
 *
 * The two lines of the wordmark are separate pieces so they can be read
 * one after the other, which is how the phrase is meant to land.
 */
let BANDS = [
    Band(name: "splash-emblem", top: 575, bottom: 935, marginX: 54, marginTop: 54, marginBottom: 16),
    Band(name: "splash-line-one", top: 968, bottom: 1017, marginX: 54, marginTop: 16, marginBottom: 4),
    Band(name: "splash-line-two", top: 1025, bottom: 1076, marginX: 54, marginTop: 4, marginBottom: 40),
]

/** A margin feathers across all but its last pixel or two. */
func feather(_ margin: Int) -> Double {
    Double(max(3, min(FEATHER, margin - 8)))
}

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

/** Gaussian elimination on the 3x3 normal equations of the plane fit. */
func solve3(_ matrix: [[Double]], _ rhs: [Double]) -> [Double] {
    var m = matrix
    var b = rhs

    for col in 0..<3 {
        var pivot = col
        for r in (col + 1)..<3 where abs(m[r][col]) > abs(m[pivot][col]) { pivot = r }
        if abs(m[pivot][col]) < 1e-9 { return [0, 0, 0] } // degenerate; leave it alone
        m.swapAt(col, pivot)
        b.swapAt(col, pivot)

        for r in 0..<3 where r != col {
            let factor = m[r][col] / m[col][col]
            for k in col..<3 { m[r][k] -= factor * m[col][k] }
            b[r] -= factor * b[col]
        }
    }

    return (0..<3).map { b[$0] / m[$0][$0] }
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

    let x0 = max(0, left - band.marginX)
    let y0 = max(0, band.top - band.marginTop)
    let x1 = min(w - 1, right + band.marginX)
    let y1 = min(h - 1, band.bottom + band.marginBottom)
    let tw = x1 - x0 + 1
    let th = y1 - y0 + 1

    let featherX = feather(band.marginX)
    let featherTop = feather(band.marginTop)
    let featherBottom = feather(band.marginBottom)

    // Level the tile to the plate.
    //
    // A single average is not enough: the plate carries a soft gradient
    // through this part of the frame, so one number fits the tile's border
    // and leaves its middle a shade light — which is exactly the rectangle
    // a viewer notices. Fitting a plane through the mismatch instead lets
    // the correction follow that gradient. Only background pixels are
    // measured; the artwork itself must not be shifted.
    var normal = [[Double]](repeating: [Double](repeating: 0, count: 3), count: 3)
    var rhs = [[Double]](repeating: [Double](repeating: 0, count: 3), count: 3)
    let cx = Double(x0 + x1) / 2, cy = Double(y0 + y1) / 2

    for y in y0...y1 {
        for x in x0...x1 {
            let i = (y * w + x) * 4
            guard channelDiff(i) <= ARTWORK else { continue }
            let basis = [1.0, Double(x) - cx, Double(y) - cy]
            for r in 0..<3 {
                for k in 0..<3 { normal[r][k] += basis[r] * basis[k] }
                for c in 0..<3 {
                    rhs[c][r] += basis[r] * (Double(plate[i + c]) - Double(lockup[i + c]))
                }
            }
        }
    }

    let fit = (0..<3).map { solve3(normal, rhs[$0]) }

    var out = [UInt8](repeating: 0, count: tw * th * 4)
    for ty in 0..<th {
        for tx in 0..<tw {
            let src = ((y0 + ty) * w + (x0 + tx)) * 4
            let dst = (ty * tw + tx) * 4

            let alpha = min(
                min(smooth(Double(tx) / featherX), smooth(Double(tw - 1 - tx) / featherX)),
                min(smooth(Double(ty) / featherTop), smooth(Double(th - 1 - ty) / featherBottom)),
            )
            let dx = Double(x0 + tx) - cx, dy = Double(y0 + ty) - cy

            for c in 0..<3 {
                let correction = fit[c][0] + fit[c][1] * dx + fit[c][2] * dy
                let levelled = Double(lockup[src + c]) + correction
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
                 band.name, tw, th, x0, y0, fx, fy, fw, fit[0][0], fit[1][0], fit[2][0]))
}
