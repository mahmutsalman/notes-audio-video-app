#include <napi.h>
#import "ScreenCaptureKit.h"

// Global reference to manager and thread-safe function
static ScreenCaptureManager *manager = nil;
static Napi::ThreadSafeFunction tsfn;

// Start capture
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 5) {
        Napi::TypeError::New(env, "Expected 5 arguments: displayID, width, height, frameRate, callback")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Detailed type checking with specific error messages
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Argument 0 (displayID) must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[1].IsNumber()) {
        Napi::TypeError::New(env, "Argument 1 (width) must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[2].IsNumber()) {
        Napi::TypeError::New(env, "Argument 2 (height) must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[3].IsNumber()) {
        Napi::TypeError::New(env, "Argument 3 (frameRate) must be a number")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[4].IsFunction()) {
        Napi::TypeError::New(env, "Argument 4 (callback) must be a function")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    uint32_t displayID = info[0].As<Napi::Number>().Uint32Value();
    int width = info[1].As<Napi::Number>().Int32Value();
    int height = info[2].As<Napi::Number>().Int32Value();
    int frameRate = info[3].As<Napi::Number>().Int32Value();
    Napi::Function frameCallback = info[4].As<Napi::Function>();

    NSLog(@"[ScreenCaptureKit Native] Creating ThreadSafeFunction");

    // Create thread-safe function for frame callback
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        frameCallback,
        "FrameCallback",
        0,          // Unlimited queue
        1,          // Only one thread will use this
        [](Napi::Env) {  // Finalizer
            NSLog(@"[ScreenCaptureKit Native] ThreadSafeFunction finalized");
        }
    );

    NSLog(@"[ScreenCaptureKit Native] Creating ScreenCaptureManager with displayID=%u, width=%d, height=%d, fps=%d",
          displayID, width, height, frameRate);

    // Create manager
    manager = [[ScreenCaptureManager alloc] initWithDisplayID:displayID
                                                        width:width
                                                       height:height
                                                   frameRate:frameRate
                                                frameCallback:^(NSData *data, int w, int h) {
        @autoreleasepool {
            // Copy data to ensure it's valid when callback executes
            NSData *dataCopy = [data copy];

            // Call JS callback from native thread
            napi_status status = tsfn.NonBlockingCall([dataCopy, w, h](Napi::Env env, Napi::Function jsCallback) {
                @autoreleasepool {
                    try {
                        // Create buffer from data
                        Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env,
                            (uint8_t*)[dataCopy bytes],
                            [dataCopy length]);

                        // Call the JavaScript callback
                        jsCallback.Call({
                            buffer,
                            Napi::Number::New(env, w),
                            Napi::Number::New(env, h)
                        });
                    } catch (const std::exception& e) {
                        NSLog(@"[ScreenCaptureKit Native] Exception in frame callback: %s", e.what());
                    }
                }
            });

            if (status != napi_ok) {
                NSLog(@"[ScreenCaptureKit Native] Failed to call JS callback: %d", status);
            }
        }
    }
                                                errorCallback:^(NSError *error) {
        NSLog(@"[ScreenCaptureKit Native] Error: %@", error);
    }];

    NSLog(@"[ScreenCaptureKit Native] Manager created, starting capture");

    NSError *error = nil;
    BOOL success = [manager startCapture:&error];

    if (!success) {
        NSString *errorMsg = error ? error.localizedDescription : @"Unknown error";
        Napi::Error::New(env, [errorMsg UTF8String]).ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }

    return Napi::Boolean::New(env, true);
}

// Stop capture
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    NSLog(@"[ScreenCaptureKit Native] StopCapture called");

    if (manager) {
        [manager stopCapture];
        manager = nil;
    }

    // Release the thread-safe function
    if (tsfn) {
        tsfn.Release();
    }

    NSLog(@"[ScreenCaptureKit Native] Capture stopped and cleaned up");

    return env.Null();
}

// Check if capturing
Napi::Value IsCapturing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (manager) {
        return Napi::Boolean::New(env, [manager isCapturing]);
    }

    return Napi::Boolean::New(env, false);
}

// Initialize addon
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startCapture", Napi::Function::New(env, StartCapture));
    exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
    exports.Set("isCapturing", Napi::Function::New(env, IsCapturing));
    return exports;
}

NODE_API_MODULE(screencapturekit_native, Init)
