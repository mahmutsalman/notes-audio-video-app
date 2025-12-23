{
  "targets": [
    {
      "target_name": "screencapturekit_native",
      "sources": [
        "ScreenCaptureKit.mm",
        "addon.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "12.3",
        "OTHER_CFLAGS": [
          "-ObjC++"
        ],
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-stdlib=libc++"
        ]
      },
      "link_settings": {
        "libraries": [
          "-framework ScreenCaptureKit",
          "-framework CoreMedia",
          "-framework CoreVideo",
          "-framework Accelerate",
          "-framework Foundation"
        ]
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
