#import "ScreenCaptureKit.h"

@implementation ScreenCaptureManager {
    SCStream *_stream;
    SCStreamConfiguration *_config;
    SCContentFilter *_filter;
    CGDirectDisplayID _displayID;
    int _width;
    int _height;
    int _frameRate;
    double _displayScaleFactor;
    int _outputWidth;
    int _outputHeight;
    double _bitsPerPixel;
    int _writerWidth;
    int _writerHeight;

    // Region coordinates for cropping
    int _regionX;
    int _regionY;
    int _regionWidth;
    int _regionHeight;

    // AVAssetWriter for hardware-accelerated encoding
    AVAssetWriter *_assetWriter;
    AVAssetWriterInput *_assetWriterInput;
    AVAssetWriterInputPixelBufferAdaptor *_pixelBufferAdaptor;
    NSString *_outputPath;

    // Timestamp normalization for video duration
    CMTime _firstFrameTime;
    CMTime _lastNormalizedTime;

    // Callbacks
    void (^_completionCallback)(NSString *, NSError *);
    void (^_errorCallback)(NSError *);

    BOOL _isCapturing;
    BOOL _isWriting;
    dispatch_queue_t _captureQueue;
    dispatch_queue_t _writerQueue;
}

- (instancetype)initWithDisplayID:(CGDirectDisplayID)displayID
                            width:(int)width
                           height:(int)height
                      scaleFactor:(double)scaleFactor
                        frameRate:(int)frameRate
                          regionX:(int)regionX
                          regionY:(int)regionY
                      regionWidth:(int)regionWidth
                     regionHeight:(int)regionHeight
                      outputWidth:(int)outputWidth
                     outputHeight:(int)outputHeight
                    bitsPerPixel:(double)bitsPerPixel
                       outputPath:(NSString *)outputPath
              completionCallback:(void (^)(NSString *, NSError *))completionCallback
                    errorCallback:(void (^)(NSError *))errorCallback {
    self = [super init];
    if (self) {
        _displayID = displayID;
        _width = width;
        _height = height;
        _displayScaleFactor = scaleFactor > 0 ? scaleFactor : 1.0;
        _frameRate = frameRate;
        _outputWidth = outputWidth > 0 ? outputWidth : width;
        _outputHeight = outputHeight > 0 ? outputHeight : height;
        _bitsPerPixel = bitsPerPixel > 0 ? bitsPerPixel : 0.15;
        _writerWidth = 0;
        _writerHeight = 0;
        _regionX = regionX;
        _regionY = regionY;
        _regionWidth = regionWidth;
        _regionHeight = regionHeight;
        _outputPath = [outputPath copy];
        _completionCallback = [completionCallback copy];
        _errorCallback = [errorCallback copy];
        _isCapturing = NO;
        _isWriting = NO;
        _captureQueue = dispatch_queue_create("com.app.screencapture", DISPATCH_QUEUE_SERIAL);
        _writerQueue = dispatch_queue_create("com.app.assetwriter", DISPATCH_QUEUE_SERIAL);
        _firstFrameTime = kCMTimeZero;
        _lastNormalizedTime = kCMTimeZero;
    }
    return self;
}

- (BOOL)startCapture:(NSError **)error {
    if (_isCapturing) {
        return YES;
    }

    NSLog(@"[ScreenCaptureKit] 🎬 Starting capture with AVAssetWriter");
    NSLog(@"[ScreenCaptureKit] Output path: %@", _outputPath);
    NSLog(@"[ScreenCaptureKit] Display: %dx%d @ %d FPS", _width, _height, _frameRate);
    NSLog(@"[ScreenCaptureKit] Output: %dx%d (bpp %.2f)", _outputWidth, _outputHeight, _bitsPerPixel);

    // Get shareable content
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSArray<SCDisplay *> *displays = nil;
    __block NSError *contentError = nil;

    [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *err) {
        @autoreleasepool {
            if (content && !err) {
                displays = [content.displays copy];
                NSLog(@"[ScreenCaptureKit] Got %lu displays", (unsigned long)displays.count);
            } else {
                contentError = err;
                NSLog(@"[ScreenCaptureKit] Error getting content: %@", err);
            }
            dispatch_semaphore_signal(semaphore);
        }
    }];

    long result = dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    if (result != 0 || contentError || !displays || displays.count == 0) {
        if (error) {
            *error = contentError ?: [NSError errorWithDomain:@"ScreenCaptureKit"
                                                         code:404
                                                     userInfo:@{NSLocalizedDescriptionKey: @"Failed to get displays"}];
        }
        return NO;
    }

    // Find target display
    SCDisplay *targetDisplay = nil;
    for (SCDisplay *display in displays) {
        if (display.displayID == _displayID) {
            targetDisplay = display;
            NSLog(@"[ScreenCaptureKit] ✅ Found display %u", _displayID);
            break;
        }
    }

    if (!targetDisplay) {
        if (error) {
            *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                         code:404
                                     userInfo:@{NSLocalizedDescriptionKey: @"Display not found"}];
        }
        return NO;
    }

    // Create content filter
    _filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:@[]];

    // Create stream configuration
    _config = [[SCStreamConfiguration alloc] init];
    _config.width = _outputWidth;
    _config.height = _outputHeight;
    _config.minimumFrameInterval = CMTimeMake(1, _frameRate);
    _config.queueDepth = 8; // Increased to prevent backpressure and frame drops
    _config.showsCursor = YES;
    _config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange; // YUV format for video encoding
    _config.scalesToFit = (_outputWidth != _width || _outputHeight != _height);

    // Set source rect for region cropping (macOS 13.0+)
    if (@available(macOS 13.0, *)) {
        BOOL useRegionCropping = (_regionWidth > 0 && _regionHeight > 0) &&
            (_regionX != 0 || _regionY != 0 || _regionWidth != _width || _regionHeight != _height);

        double scaleFactor = _displayScaleFactor > 0 ? _displayScaleFactor : 1.0;
        CGRect sourceRect = CGRectMake(_regionX / scaleFactor,
                                       _regionY / scaleFactor,
                                       _regionWidth / scaleFactor,
                                       _regionHeight / scaleFactor);
        _config.sourceRect = sourceRect;
        if (useRegionCropping) {
            BOOL shouldScale = (_outputWidth != _regionWidth || _outputHeight != _regionHeight);
            _config.scalesToFit = shouldScale;
            NSLog(@"[ScreenCaptureKit] 📐 Output size: %dx%d (region %dx%d, scaleFactor %.2f, scaled=%@)",
                  _outputWidth,
                  _outputHeight,
                  _regionWidth,
                  _regionHeight,
                  scaleFactor,
                  shouldScale ? @"YES" : @"NO");
        }
        NSLog(@"[ScreenCaptureKit] 🎯 Using sourceRect for native cropping: {%.1f, %.1f, %.1f, %.1f} (scaleFactor %.2f)",
              sourceRect.origin.x,
              sourceRect.origin.y,
              sourceRect.size.width,
              sourceRect.size.height,
              scaleFactor);
    } else {
        NSLog(@"[ScreenCaptureKit] ⚠️  sourceRect not available (requires macOS 13.0+), capturing full display");
    }

    // Create stream
    _stream = [[SCStream alloc] initWithFilter:_filter
                                 configuration:_config
                                      delegate:self];

    // Add stream output
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
    dispatch_semaphore_t startSemaphore = dispatch_semaphore_create(0);
    __block NSError *startError = nil;

    [_stream startCaptureWithCompletionHandler:^(NSError *err) {
        startError = err;
        if (!err) {
            NSLog(@"[ScreenCaptureKit] ✅ Capture started");
        }
        dispatch_semaphore_signal(startSemaphore);
    }];

    long startResult = dispatch_semaphore_wait(startSemaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    if (startResult != 0 || startError) {
        if (error) *error = startError ?: [NSError errorWithDomain:@"ScreenCaptureKit" code:408 userInfo:@{NSLocalizedDescriptionKey: @"Timeout starting capture"}];
        return NO;
    }

    _isCapturing = YES;
    NSLog(@"[ScreenCaptureKit] 🎥 Recording to file with hardware encoding");
    return YES;
}

- (BOOL)setupAssetWriterWithWidth:(int)width
                           height:(int)height
                      pixelFormat:(OSType)pixelFormat
                            error:(NSError **)error {
    @autoreleasepool {
        // Remove existing file if it exists
        NSFileManager *fileManager = [NSFileManager defaultManager];
        if ([fileManager fileExistsAtPath:_outputPath]) {
            [fileManager removeItemAtPath:_outputPath error:nil];
        }

        // Create output URL
        NSURL *outputURL = [NSURL fileURLWithPath:_outputPath];

        // Create AVAssetWriter
        _assetWriter = [[AVAssetWriter alloc] initWithURL:outputURL
                                                 fileType:AVFileTypeMPEG4
                                                    error:error];
        if (!_assetWriter || *error) {
            NSLog(@"[ScreenCaptureKit] ❌ Failed to create AVAssetWriter: %@", *error);
            return NO;
        }

        // Configure video settings for hardware H.264 encoding
        double bitsPerPixel = _bitsPerPixel > 0 ? _bitsPerPixel : 0.15;
        NSDictionary *videoSettings = @{
            AVVideoCodecKey: AVVideoCodecTypeH264,
            AVVideoWidthKey: @(width),
            AVVideoHeightKey: @(height),
            AVVideoCompressionPropertiesKey: @{
                AVVideoAverageBitRateKey: @(width * height * _frameRate * bitsPerPixel),
                AVVideoExpectedSourceFrameRateKey: @(_frameRate),
                AVVideoMaxKeyFrameIntervalKey: @(_frameRate * 2), // Keyframe every 2 seconds
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            }
        };

        _assetWriterInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo
                                                                outputSettings:videoSettings];
        _assetWriterInput.expectsMediaDataInRealTime = YES;

        if ([_assetWriter canAddInput:_assetWriterInput]) {
            [_assetWriter addInput:_assetWriterInput];
        } else {
            if (error) {
                *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                             code:500
                                         userInfo:@{NSLocalizedDescriptionKey: @"Cannot add video input to asset writer"}];
            }
            return NO;
        }

        NSDictionary *pixelBufferAttributes = @{
            (id)kCVPixelBufferPixelFormatTypeKey: @(pixelFormat),
            (id)kCVPixelBufferWidthKey: @(width),
            (id)kCVPixelBufferHeightKey: @(height)
        };
        _pixelBufferAdaptor = [AVAssetWriterInputPixelBufferAdaptor
            assetWriterInputPixelBufferAdaptorWithAssetWriterInput:_assetWriterInput
            sourcePixelBufferAttributes:pixelBufferAttributes];
        if (!_pixelBufferAdaptor) {
            if (error) {
                *error = [NSError errorWithDomain:@"ScreenCaptureKit"
                                             code:500
                                         userInfo:@{NSLocalizedDescriptionKey: @"Failed to create pixel buffer adaptor"}];
            }
            return NO;
        }

        // Start writing session
        if (![_assetWriter startWriting]) {
            if (error) *error = _assetWriter.error;
            NSLog(@"[ScreenCaptureKit] ❌ Failed to start writing: %@", _assetWriter.error);
            return NO;
        }

        // Don't start session here - will be started on first frame
        // This prevents system uptime from becoming video duration
        _isWriting = YES;
        _writerWidth = width;
        _writerHeight = height;

        NSLog(@"[ScreenCaptureKit] ✅ AVAssetWriter initialized");
        NSLog(@"[ScreenCaptureKit] 🎯 Using hardware H.264 encoder");
        NSLog(@"[ScreenCaptureKit] 📏 Writer resolution: %dx%d", width, height);
        NSLog(@"[ScreenCaptureKit] 📊 Bitrate: %.2f Mbps", (width * height * _frameRate * bitsPerPixel) / 1000000.0);

        return YES;
    }
}

- (void)stopCapture {
    if (!_isCapturing) {
        return;
    }

    NSLog(@"[ScreenCaptureKit] ⏹️  Stopping capture...");

    _isCapturing = NO;

    // Stop stream
    if (_stream) {
        dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
        [_stream stopCaptureWithCompletionHandler:^(NSError *error) {
            if (error) {
                NSLog(@"[ScreenCaptureKit] Stop error: %@", error);
            }
            dispatch_semaphore_signal(semaphore);
        }];
        dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
        _stream = nil;
    }

    // Finish writing
    [self finishWriting];
}

- (void)finishWriting {
    if (!_isWriting || !_assetWriter || !_assetWriterInput) {
        NSLog(@"[ScreenCaptureKit] ⚠️  Not writing, nothing to finish");
        if (_completionCallback) {
            _completionCallback(nil, [NSError errorWithDomain:@"ScreenCaptureKit" code:500 userInfo:@{NSLocalizedDescriptionKey: @"Writer not active"}]);
        }
        return;
    }

    _isWriting = NO;

    // Log final statistics
    if (!CMTIME_COMPARE_INLINE(_lastNormalizedTime, ==, kCMTimeZero)) {
        NSLog(@"[ScreenCaptureKit] 🏁 Final frame: %.2f seconds",
              CMTimeGetSeconds(_lastNormalizedTime));
        NSLog(@"[ScreenCaptureKit] 📊 Recording duration: %.2f seconds",
              CMTimeGetSeconds(_lastNormalizedTime));
    }

    NSLog(@"[ScreenCaptureKit] 📝 Finishing asset writer...");

    // Mark input as finished
    [_assetWriterInput markAsFinished];

    // Finish writing asynchronously
    __weak ScreenCaptureManager *weakSelf = self;
    [_assetWriter finishWritingWithCompletionHandler:^{
        __strong ScreenCaptureManager *strongSelf = weakSelf;
        if (!strongSelf) return;

        if (strongSelf->_assetWriter.status == AVAssetWriterStatusCompleted) {
            NSLog(@"[ScreenCaptureKit] ✅ Recording completed successfully");
            NSLog(@"[ScreenCaptureKit] 📁 File: %@", strongSelf->_outputPath);

            // Get file size
            NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:strongSelf->_outputPath error:nil];
            unsigned long long fileSize = [attrs fileSize];
            NSLog(@"[ScreenCaptureKit] 📊 File size: %.2f MB", fileSize / 1024.0 / 1024.0);

            if (strongSelf->_completionCallback) {
                strongSelf->_completionCallback(strongSelf->_outputPath, nil);
            }
        } else {
            NSLog(@"[ScreenCaptureKit] ❌ Writing failed: %@", strongSelf->_assetWriter.error);
            if (strongSelf->_completionCallback) {
                strongSelf->_completionCallback(nil, strongSelf->_assetWriter.error);
            }
        }

        strongSelf->_assetWriter = nil;
        strongSelf->_assetWriterInput = nil;
        strongSelf->_pixelBufferAdaptor = nil;
    }];
}

- (BOOL)isCapturing {
    return _isCapturing;
}

#pragma mark - SCStreamDelegate

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    NSLog(@"[ScreenCaptureKit] 🚨 Stream stopped with error: %@", error);

    if (_errorCallback) {
        _errorCallback(error);
    }

    // Don't auto-restart - let the application handle it
    _isCapturing = NO;
}

#pragma mark - SCStreamOutput

- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
    ofType:(SCStreamOutputType)type {

    @autoreleasepool {
        static int frameCount = 0;
        frameCount++;

        if (type != SCStreamOutputTypeScreen) {
            NSLog(@"[ScreenCaptureKit] ⚠️ Frame %d: Non-screen type, skipping", frameCount);
            return;
        }

        if (!_isCapturing) {
            NSLog(@"[ScreenCaptureKit] ❌ Frame %d: capture inactive, DROPPING FRAME", frameCount);
            return;
        }

        // Log every 10th frame to track activity
        if (frameCount % 10 == 0 || frameCount <= 5) {
            NSLog(@"[ScreenCaptureKit] 📹 Frame %d received and processing", frameCount);
        }

        // Get presentation timestamp
        CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);

        // Validate timestamp
        if (!CMTIME_IS_VALID(presentationTime)) {
            NSLog(@"[ScreenCaptureKit] ⚠️ Invalid timestamp, dropping frame");
            return;
        }

        CFArrayRef attachmentsArray = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, false);
        if (attachmentsArray && CFArrayGetCount(attachmentsArray) > 0) {
            CFDictionaryRef attachments = (CFDictionaryRef)CFArrayGetValueAtIndex(attachmentsArray, 0);
            CFTypeRef statusValue = CFDictionaryGetValue(attachments, (__bridge const void *)SCStreamFrameInfoStatus);
            if (statusValue) {
                SCFrameStatus frameStatus = (SCFrameStatus)[(__bridge NSNumber *)statusValue integerValue];
                if (frameStatus != SCFrameStatusComplete) {
                    static int incompleteCount = 0;
                    incompleteCount++;
                    if (incompleteCount <= 5 || incompleteCount % 20 == 0) {
                        NSLog(@"[ScreenCaptureKit] ⚠️ Frame %d: Incomplete status (%ld), skipping",
                              frameCount, (long)frameStatus);
                    }
                    return;
                }
            }
        }

        CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
        if (!pixelBuffer) {
            static int nilPixelBufferCount = 0;
            nilPixelBufferCount++;
            if (nilPixelBufferCount <= 5 || nilPixelBufferCount % 20 == 0) {
                NSLog(@"[ScreenCaptureKit] ❌ Frame %d: Failed to get pixel buffer", frameCount);
            }
            return;
        }

        if (!_assetWriterInput || !_pixelBufferAdaptor || !_assetWriter) {
            NSError *setupError = nil;
            int bufferWidth = (int)CVPixelBufferGetWidth(pixelBuffer);
            int bufferHeight = (int)CVPixelBufferGetHeight(pixelBuffer);
            OSType bufferFormat = CVPixelBufferGetPixelFormatType(pixelBuffer);
            if (![self setupAssetWriterWithWidth:bufferWidth
                                          height:bufferHeight
                                     pixelFormat:bufferFormat
                                           error:&setupError]) {
                NSLog(@"[ScreenCaptureKit] ❌ Failed to setup AVAssetWriter from first frame: %@",
                      setupError.localizedDescription ?: @"Unknown error");
                return;
            }
        }

        // Detect first frame and start session at ZERO
        if (CMTIME_COMPARE_INLINE(_firstFrameTime, ==, kCMTimeZero)) {
            _firstFrameTime = presentationTime;

            // Start AVAssetWriter session at ZERO - all timestamps will be relative
            [_assetWriter startSessionAtSourceTime:kCMTimeZero];

            NSLog(@"[ScreenCaptureKit] 📌 First frame captured");
            NSLog(@"[ScreenCaptureKit] ⏱️  System uptime: %.2f seconds",
                  CMTimeGetSeconds(_firstFrameTime));
            NSLog(@"[ScreenCaptureKit] 🎬 Session started at ZERO for normalized timestamps");
        }

        // Calculate normalized time (relative to first frame, starting from zero)
        CMTime normalizedTime = CMTimeSubtract(presentationTime, _firstFrameTime);

        // Check if encoder is ready
        if (!_assetWriterInput.readyForMoreMediaData) {
            static int dropCount = 0;
            if (++dropCount % 10 == 0) {
                NSLog(@"[ScreenCaptureKit] ⚠️ Encoder busy, dropped %d frames", dropCount);
            }
            return;
        }

        // Append pixel buffer with normalized timing
        BOOL success = [_pixelBufferAdaptor appendPixelBuffer:pixelBuffer
                                        withPresentationTime:normalizedTime];

        if (!success) {
            NSLog(@"[ScreenCaptureKit] ❌ Failed to append pixel buffer");
            if (_assetWriter.status == AVAssetWriterStatusFailed) {
                NSLog(@"[ScreenCaptureKit] ❌ Writer failed: %@", _assetWriter.error);
            }
        } else {
            // Track last normalized time for duration logging
            _lastNormalizedTime = normalizedTime;
        }
    }
}

- (void)dealloc {
    [self stopCapture];
}

@end
