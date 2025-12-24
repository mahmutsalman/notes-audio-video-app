#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <AVFoundation/AVFoundation.h>

@interface ScreenCaptureManager : NSObject <SCStreamDelegate, SCStreamOutput>

// Initialization with file-based recording and region cropping
- (instancetype)initWithDisplayID:(CGDirectDisplayID)displayID
                            width:(int)width
                           height:(int)height
                      scaleFactor:(double)scaleFactor
                        frameRate:(int)frameRate
                          regionX:(int)regionX
                          regionY:(int)regionY
                      regionWidth:(int)regionWidth
                     regionHeight:(int)regionHeight
                       outputPath:(NSString *)outputPath
              completionCallback:(void (^)(NSString *filePath, NSError *error))completionCallback
                    errorCallback:(void (^)(NSError *error))errorCallback;

// Stream control
- (BOOL)startCapture:(NSError **)error;
- (void)stopCapture;
- (BOOL)isCapturing;

// SCStreamDelegate methods
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error;

// SCStreamOutput methods
- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
    ofType:(SCStreamOutputType)type;

@end
