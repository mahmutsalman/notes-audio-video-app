#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>

@interface ScreenCaptureManager : NSObject <SCStreamDelegate, SCStreamOutput>

// Initialization
- (instancetype)initWithDisplayID:(CGDirectDisplayID)displayID
                            width:(int)width
                           height:(int)height
                        frameRate:(int)frameRate
                    frameCallback:(void (^)(NSData *frameData, int width, int height))callback
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
