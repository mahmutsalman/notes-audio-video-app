import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 6,
      let x = Double(args[2]),
      let y = Double(args[3]),
      let w = Double(args[4]),
      let h = Double(args[5])
else {
    fputs("Usage: ocr_helper <image_path> <x> <y> <width> <height>\n", stderr)
    exit(1)
}

let imagePath = args[1]
let url = URL(fileURLWithPath: imagePath)

guard let nsImage = NSImage(contentsOf: url),
      let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    fputs("Error: cannot load image at \(imagePath)\n", stderr)
    exit(1)
}

let iw = Double(cgImage.width)
let ih = Double(cgImage.height)

// Vision uses normalized coordinates with bottom-left origin
let normX = max(0, min(1, x / iw))
let normY = max(0, min(1, 1.0 - (y + h) / ih))
let normW = max(0, min(1 - normX, w / iw))
let normH = max(0, min(1 - normY, h / ih))

let roi = CGRect(x: normX, y: normY, width: normW, height: normH)

let semaphore = DispatchSemaphore(value: 0)

let request = VNRecognizeTextRequest { req, error in
    defer { semaphore.signal() }
    if let error = error {
        fputs("Vision error: \(error.localizedDescription)\n", stderr)
        return
    }
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    let text = lines.joined(separator: " ")
    print(text)
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.regionOfInterest = roi

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Handler error: \(error.localizedDescription)\n", stderr)
    exit(1)
}

semaphore.wait()
