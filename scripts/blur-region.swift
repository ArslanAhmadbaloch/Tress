// Blurs one circular region of an image, feathering back to sharp.
// usage: blur-region <in> <out.jpg> <cx> <cy-from-top> <sharpRadius> <fadeRadius> <sigma>
import CoreImage
import Foundation

let a = CommandLine.arguments
let input = URL(fileURLWithPath: a[1]), output = URL(fileURLWithPath: a[2])
let cx = Double(a[3])!, cyTop = Double(a[4])!, r0 = Double(a[5])!, r1 = Double(a[6])!, sigma = Double(a[7])!

guard let image = CIImage(contentsOf: input) else { fatalError("could not load \(input.path)") }
let extent = image.extent
// Core Image's origin is bottom-left.
let centre = CIVector(x: cx, y: extent.height - cyTop)

let blurred = image.clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: extent)
let mask = CIFilter(name: "CIRadialGradient", parameters: [
  "inputCenter": centre, "inputRadius0": r0, "inputRadius1": r1,
  "inputColor0": CIColor.white, "inputColor1": CIColor.black,
])!.outputImage!.cropped(to: extent)

let result = blurred.applyingFilter("CIBlendWithMask", parameters: [
  kCIInputBackgroundImageKey: image, kCIInputMaskImageKey: mask,
])

let options = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.8]
try CIContext().writeJPEGRepresentation(of: result, to: output, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: options)
print("wrote \(output.path)")
