#include <napi.h>
#import "ScreenCaptureKit.h"

// Global reference to manager
static ScreenCaptureManager *manager = nil;
static Napi::ThreadSafeFunction completionTsfn;
static Napi::ThreadSafeFunction errorTsfn;

// Start capture with file output
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 10) {
        Napi::TypeError::New(env, "Expected 10 or 11 arguments: displayID, width, height, frameRate, [scaleFactor], regionX, regionY, regionWidth, regionHeight, outputPath, callbacks")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Type checking
    if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "Argument 0 (displayID) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[1].IsNumber()) {
        Napi::TypeError::New(env, "Argument 1 (width) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[2].IsNumber()) {
        Napi::TypeError::New(env, "Argument 2 (height) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[3].IsNumber()) {
        Napi::TypeError::New(env, "Argument 3 (frameRate) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool hasScaleFactor = info.Length() >= 11;
    int regionXIndex = hasScaleFactor ? 5 : 4;
    int regionYIndex = hasScaleFactor ? 6 : 5;
    int regionWidthIndex = hasScaleFactor ? 7 : 6;
    int regionHeightIndex = hasScaleFactor ? 8 : 7;
    int outputPathIndex = hasScaleFactor ? 9 : 8;
    int callbacksIndex = hasScaleFactor ? 10 : 9;

    if (hasScaleFactor && !info[4].IsNumber()) {
        Napi::TypeError::New(env, "Argument 4 (scaleFactor) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[regionXIndex].IsNumber()) {
        Napi::TypeError::New(env, "Argument 4/5 (regionX) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[regionYIndex].IsNumber()) {
        Napi::TypeError::New(env, "Argument 5/6 (regionY) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[regionWidthIndex].IsNumber()) {
        Napi::TypeError::New(env, "Argument 6/7 (regionWidth) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[regionHeightIndex].IsNumber()) {
        Napi::TypeError::New(env, "Argument 7/8 (regionHeight) must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[outputPathIndex].IsString()) {
        Napi::TypeError::New(env, "Argument 8/9 (outputPath) must be a string").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!info[callbacksIndex].IsObject()) {
        Napi::TypeError::New(env, "Argument 9/10 (callbacks) must be an object").ThrowAsJavaScriptException();
        return env.Null();
    }

    uint32_t displayID = info[0].As<Napi::Number>().Uint32Value();
    int width = info[1].As<Napi::Number>().Int32Value();
    int height = info[2].As<Napi::Number>().Int32Value();
    int frameRate = info[3].As<Napi::Number>().Int32Value();
    double scaleFactor = hasScaleFactor ? info[4].As<Napi::Number>().DoubleValue() : 1.0;
    int regionX = info[regionXIndex].As<Napi::Number>().Int32Value();
    int regionY = info[regionYIndex].As<Napi::Number>().Int32Value();
    int regionWidth = info[regionWidthIndex].As<Napi::Number>().Int32Value();
    int regionHeight = info[regionHeightIndex].As<Napi::Number>().Int32Value();
    std::string outputPath = info[outputPathIndex].As<Napi::String>().Utf8Value();

    Napi::Object callbacks = info[callbacksIndex].As<Napi::Object>();
    Napi::Function onComplete = callbacks.Get("onComplete").As<Napi::Function>();
    Napi::Function onError = callbacks.Get("onError").As<Napi::Function>();

    NSLog(@"[ScreenCaptureKit Native] Starting file-based recording with region cropping");
    NSLog(@"[ScreenCaptureKit Native] Output: %s", outputPath.c_str());
    NSLog(@"[ScreenCaptureKit Native] Display: %dx%d @ %d FPS", width, height, frameRate);
    NSLog(@"[ScreenCaptureKit Native] Scale factor: %.2f", scaleFactor);
    NSLog(@"[ScreenCaptureKit Native] Region: {%d, %d, %d, %d}", regionX, regionY, regionWidth, regionHeight);

    // Create thread-safe functions for callbacks
    completionTsfn = Napi::ThreadSafeFunction::New(
        env,
        onComplete,
        "CompletionCallback",
        0,  // Unlimited queue (completion happens once)
        1,
        [](Napi::Env) {
            NSLog(@"[ScreenCaptureKit Native] Completion TSFN finalized");
        }
    );

    errorTsfn = Napi::ThreadSafeFunction::New(
        env,
        onError,
        "ErrorCallback",
        0,  // Unlimited queue
        1,
        [](Napi::Env) {
            NSLog(@"[ScreenCaptureKit Native] Error TSFN finalized");
        }
    );

    // Convert std::string to NSString
    NSString *outputPathNS = [NSString stringWithUTF8String:outputPath.c_str()];

    // Create manager with file-based recording
    manager = [[ScreenCaptureManager alloc] initWithDisplayID:displayID
                                                        width:width
                                                       height:height
                                                 scaleFactor:scaleFactor
                                                    frameRate:frameRate
                                                      regionX:regionX
                                                      regionY:regionY
                                                  regionWidth:regionWidth
                                                 regionHeight:regionHeight
                                                   outputPath:outputPathNS
                                          completionCallback:^(NSString *filePath, NSError *error) {
        @autoreleasepool {
            if (filePath && !error) {
                // Success - call completion callback with file path
                std::string filePathStr = [filePath UTF8String];

                completionTsfn.BlockingCall([filePathStr](Napi::Env env, Napi::Function jsCallback) {
                    jsCallback.Call({
                        Napi::String::New(env, filePathStr)
                    });
                });

                NSLog(@"[ScreenCaptureKit Native] ✅ Recording completed: %@", filePath);
            } else {
                // Error - call error callback
                std::string errorMsg = error ? [[error localizedDescription] UTF8String] : "Unknown error";

                errorTsfn.BlockingCall([errorMsg](Napi::Env env, Napi::Function jsCallback) {
                    jsCallback.Call({
                        Napi::String::New(env, errorMsg)
                    });
                });

                NSLog(@"[ScreenCaptureKit Native] ❌ Recording failed: %@", error);
            }

            // Release the thread-safe functions after calling them
            if (completionTsfn) {
                completionTsfn.Release();
                NSLog(@"[ScreenCaptureKit Native] Completion TSFN released");
            }
            if (errorTsfn) {
                errorTsfn.Release();
                NSLog(@"[ScreenCaptureKit Native] Error TSFN released");
            }

            // Clean up manager now that we're done
            manager = nil;
            NSLog(@"[ScreenCaptureKit Native] Manager cleaned up");
        }
    }
                                               errorCallback:^(NSError *error) {
        @autoreleasepool {
            std::string errorMsg = error ? [[error localizedDescription] UTF8String] : "Unknown error";

            errorTsfn.BlockingCall([errorMsg](Napi::Env env, Napi::Function jsCallback) {
                jsCallback.Call({
                    Napi::String::New(env, errorMsg)
                });
            });

            NSLog(@"[ScreenCaptureKit Native] ⚠️  Stream error: %@", error);
        }
    }];

    NSError *error = nil;
    BOOL success = [manager startCapture:&error];

    if (!success) {
        NSString *errorMsg = error ? error.localizedDescription : @"Unknown error";
        Napi::Error::New(env, [errorMsg UTF8String]).ThrowAsJavaScriptException();

        // Clean up thread-safe functions
        if (completionTsfn) completionTsfn.Release();
        if (errorTsfn) errorTsfn.Release();

        return Napi::Boolean::New(env, false);
    }

    NSLog(@"[ScreenCaptureKit Native] ✅ Recording started with AVAssetWriter");
    return Napi::Boolean::New(env, true);
}

// Stop capture
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    NSLog(@"[ScreenCaptureKit Native] StopCapture called");

    if (manager) {
        [manager stopCapture];
        // DO NOT set manager = nil here!
        // Keep manager alive until completion callback fires
        // Manager will be cleaned up in the completion callback
    }

    // DO NOT release the thread-safe functions here!
    // They will be released AFTER the completion callback is called
    // AVAssetWriter finishes asynchronously, so we need to wait for the callback

    NSLog(@"[ScreenCaptureKit Native] Capture stopped, waiting for AVAssetWriter to finish");

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
