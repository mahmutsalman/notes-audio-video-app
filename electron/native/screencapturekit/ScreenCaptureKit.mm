#import "ScreenCaptureKit.h"
#import <Accelerate/Accelerate.h>

@implementation ScreenCaptureManager {
    SCStream *_stream;
    SCStreamConfiguration *_config;
    SCContentFilter *_filter;
    CGDirectDisplayID _displayID;
    int _width;
    int _height;
    int _frameRate;
    void (^_frameCallback)(NSData *, int, int);
    void (^_errorCallback)(NSError *);
    BOOL _isCapturing;
    dispatch_queue_t _captureQueue;
}

- (instancetype)initWithDisplayID:(CGDirectDisplayID)displayID
                            width:(int)width
                           height:(int)height
                        frameRate:(int)frameRate
                    frameCallback:(void (^)(NSData *, int, int))callback
                    errorCallback:(void (^)(NSError *))errorCallback {
    self = [super init];
    if (self) {
        _displayID = displayID;
        _width = width;
        _height = height;
        _frameRate = frameRate;
        _frameCallback = [callback copy];
        _errorCallback = [errorCallback copy];
        _isCapturing = NO;
        _captureQueue = dispatch_queue_create("com.app.screencapture", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (BOOL)startCapture:(NSError **)error {
    if (_isCapturing) {
        return YES;
    }

    NSLog(@"[ScreenCaptureKit] 🔍 Getting shareable content...");

    // Get shareable content - extract what we need in the completion handler
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSArray<SCDisplay *> *displays = nil;
    __block NSError *contentError = nil;

    [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *err) {
        @autoreleasepool {
            if (content && !err) {
                // Extract displays array while the content object is still valid
                displays = [content.displays copy]; // Make a copy to ensure it's retained
                NSLog(@"[ScreenCaptureKit] 📦 Shareable content received: displays=%lu, error=(null)",
                      (unsigned long)displays.count);
            } else {
                contentError = err;
                NSLog(@"[ScreenCaptureKit] 📦 Shareable content received: displays=0, error=%@", err);
            }
            dispatch_semaphore_signal(semaphore);
        }
    }];

    // Wait with timeout to avoid permanent blocking
    long result = dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

    if (result != 0) {
        NSLog(@"[ScreenCaptureKit] ❌ Timeout waiting for shareable content");
        if (error) {
            *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                        code:408
                                    userInfo:@{NSLocalizedDescriptionKey: @"Timeout getting shareable content"}];
        }
        return NO;
    }

    NSLog(@"[ScreenCaptureKit] ✅ Semaphore completed, checking results...");

    if (contentError) {
        NSLog(@"[ScreenCaptureKit] ❌ Content error: %@", contentError);
        if (error) *error = contentError;
        return NO;
    }

    if (!displays || displays.count == 0) {
        NSLog(@"[ScreenCaptureKit] ❌ No displays available!");
        if (error) {
            *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                        code:404
                                    userInfo:@{NSLocalizedDescriptionKey: @"No displays available"}];
        }
        return NO;
    }

    NSLog(@"[ScreenCaptureKit] ✅ Got %lu displays", (unsigned long)displays.count);

    // Find the display
    NSLog(@"[ScreenCaptureKit] 🔍 Looking for display ID %u in %lu displays",
          _displayID, (unsigned long)displays.count);

    SCDisplay *targetDisplay = nil;
    for (SCDisplay *display in displays) {
        NSLog(@"[ScreenCaptureKit]   - Display ID: %u, width: %lu, height: %lu",
              display.displayID, (unsigned long)display.width, (unsigned long)display.height);
        if (display.displayID == _displayID) {
            targetDisplay = display;
            NSLog(@"[ScreenCaptureKit] ✅ Found target display");
            break;
        }
    }

    if (!targetDisplay) {
        NSLog(@"[ScreenCaptureKit] ❌ Display %u not found", _displayID);
        if (error) {
            *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                        code:404
                                    userInfo:@{NSLocalizedDescriptionKey: @"Display not found"}];
        }
        return NO;
    }

    // Create content filter
    NSLog(@"[ScreenCaptureKit] 🔨 Creating content filter...");
    _filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay
                                      excludingWindows:@[]];

    // Create stream configuration
    NSLog(@"[ScreenCaptureKit] ⚙️  Configuring stream (width=%d, height=%d, fps=%d)...",
          _width, _height, _frameRate);
    _config = [[SCStreamConfiguration alloc] init];
    _config.width = _width;
    _config.height = _height;
    _config.minimumFrameInterval = CMTimeMake(1, _frameRate);
    _config.queueDepth = 5;
    _config.showsCursor = YES;
    _config.pixelFormat = kCVPixelFormatType_32BGRA; // BGRA format
    _config.scalesToFit = YES;

    // Create stream
    NSLog(@"[ScreenCaptureKit] 🎬 Creating SCStream...");
    _stream = [[SCStream alloc] initWithFilter:_filter
                                 configuration:_config
                                      delegate:self];

    // Add stream output (self)
    NSLog(@"[ScreenCaptureKit] 📤 Adding stream output...");
    NSError *addOutputError = nil;
    [_stream addStreamOutput:self
                        type:SCStreamOutputTypeScreen
              sampleHandlerQueue:_captureQueue
                           error:&addOutputError];

    if (addOutputError) {
        NSLog(@"[ScreenCaptureKit] ❌ Failed to add stream output: %@", addOutputError);
        if (error) *error = addOutputError;
        return NO;
    }

    // Start streaming
    NSLog(@"[ScreenCaptureKit] ▶️  Starting capture...");
    dispatch_semaphore_t startSemaphore = dispatch_semaphore_create(0);
    __block NSError *startError = nil;

    [_stream startCaptureWithCompletionHandler:^(NSError *err) {
        startError = err;
        NSLog(@"[ScreenCaptureKit] 🎯 Start capture completion: error=%@", err);
        dispatch_semaphore_signal(startSemaphore);
    }];

    // Wait with timeout
    long startResult = dispatch_semaphore_wait(startSemaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

    if (startResult != 0) {
        NSLog(@"[ScreenCaptureKit] ❌ Timeout waiting for capture start");
        if (error) {
            *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                        code:408
                                    userInfo:@{NSLocalizedDescriptionKey: @"Timeout starting capture"}];
        }
        return NO;
    }

    if (startError) {
        if (error) *error = startError;
        return NO;
    }

    _isCapturing = YES;
    NSLog(@"[ScreenCaptureKit] ✅ Capture started for display %u", _displayID);
    return YES;
}

- (void)stopCapture {
    if (!_isCapturing || !_stream) {
        return;
    }

    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

    [_stream stopCaptureWithCompletionHandler:^(NSError *error) {
        if (error) {
            NSLog(@"[ScreenCaptureKit] Stop error: %@", error.localizedDescription);
        }
        dispatch_semaphore_signal(semaphore);
    }];

    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

    _isCapturing = NO;
    _stream = nil;
    NSLog(@"[ScreenCaptureKit] ✅ Capture stopped");
}

- (BOOL)isCapturing {
    return _isCapturing;
}

#pragma mark - SCStreamDelegate

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    NSLog(@"[ScreenCaptureKit] 🚨 Stream stopped with error (code: %ld): %@", (long)error.code, error);

    // Auto-restart on any error - this handles Space transitions and other recoverable issues
    // Space transitions typically cause the stream to stop, regardless of the specific error code
    NSLog(@"[ScreenCaptureKit] 🔄 Stream stopped (likely Space transition or system event) - attempting restart...");

    // Notify error callback for handling
    if (_errorCallback) {
        _errorCallback(error);
    }

    // Auto-restart after brief delay
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        NSError *restartError = nil;
        if (![self startCapture:&restartError]) {
            NSLog(@"[ScreenCaptureKit] ❌ Auto-restart failed: %@", restartError.localizedDescription);
        } else {
            NSLog(@"[ScreenCaptureKit] ✅ Auto-restart successful");
        }
    });
}

#pragma mark - SCStreamOutput

- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
    ofType:(SCStreamOutputType)type {

    if (type != SCStreamOutputTypeScreen) {
        return;
    }

    // Get image buffer from sample buffer
    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!imageBuffer) {
        return;
    }

    CVPixelBufferLockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);

    uint8_t *baseAddress = (uint8_t *)CVPixelBufferGetBaseAddress(imageBuffer);
    size_t bytesPerRow = CVPixelBufferGetBytesPerRow(imageBuffer);
    size_t width = CVPixelBufferGetWidth(imageBuffer);
    size_t height = CVPixelBufferGetHeight(imageBuffer);

    // Calculate expected size for ImageData (width * height * 4 for RGBA)
    size_t expectedBytesPerRow = width * 4;
    size_t unpackedSize = expectedBytesPerRow * height;

    // If bytesPerRow has padding, we need to remove it
    NSData *frameData = nil;
    if (bytesPerRow != expectedBytesPerRow) {
        // Allocate buffer for unpacked data (without row padding)
        NSMutableData *unpackedData = [NSMutableData dataWithLength:unpackedSize];
        uint8_t *dest = (uint8_t *)[unpackedData mutableBytes];

        // Copy row by row, removing padding
        for (size_t row = 0; row < height; row++) {
            uint8_t *srcRow = baseAddress + (row * bytesPerRow);
            uint8_t *destRow = dest + (row * expectedBytesPerRow);
            memcpy(destRow, srcRow, expectedBytesPerRow);
        }

        frameData = unpackedData;
    } else {
        // No padding, can copy directly
        frameData = [NSData dataWithBytes:baseAddress length:unpackedSize];
    }

    CVPixelBufferUnlockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);

    // Send frame to callback
    if (_frameCallback) {
        _frameCallback(frameData, (int)width, (int)height);
    }
}

- (void)dealloc {
    [self stopCapture];
}

@end
