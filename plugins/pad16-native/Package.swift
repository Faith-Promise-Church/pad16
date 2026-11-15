// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Pad16Native",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "Pad16Native", targets: ["Pad16NativePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "Pad16NativePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/Pad16NativePlugin")
    ]
)
