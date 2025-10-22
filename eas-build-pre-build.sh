#!/bin/sh
set -euxo pipefail

echo "===== EAS Pre-Build Hook ====="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo "===== Building Vue app ====="
npm run build

echo "===== Checking Android directory ====="
if [ ! -d android ]; then
  echo "Android directory not found, adding it..."
  npx cap add android --skip-deps
else
  echo "Android directory exists"
fi

echo "===== Syncing Capacitor ====="
npx cap sync android

echo "===== Cleaning Gradle cache ====="
# Remove Gradle cache to prevent stale configuration issues
if [ -d "android/.gradle" ]; then
  echo "Removing android/.gradle directory..."
  rm -rf android/.gradle
fi
if [ -d "android/build" ]; then
  echo "Removing android/build directory..."
  rm -rf android/build
fi
if [ -d "android/app/build" ]; then
  echo "Removing android/app/build directory..."
  rm -rf android/app/build
fi

echo "===== Patching Gradle files ====="

# Patch Java version from 21 to 17 for EAS Build compatibility
echo "Downgrading Java version from 21 to 17..."
find android -name "*.gradle" -type f -exec sed -i.bak 's/VERSION_21/VERSION_17/g' {} \;
echo "✓ Updated Java version to 17"

# Make the cordova.variables.gradle include conditional to prevent build failures
if [ -f "android/app/capacitor.build.gradle" ]; then
  # Check if the file already has the conditional check
  if ! grep -q "cordovaVariablesFile.exists()" android/app/capacitor.build.gradle; then
    echo "Adding conditional check for cordova.variables.gradle..."
    # Replace the unconditional apply with a conditional one
    sed -i.bak 's|apply from: "../capacitor-cordova-android-plugins/cordova.variables.gradle"|def cordovaVariablesFile = file("../capacitor-cordova-android-plugins/cordova.variables.gradle")\nif (cordovaVariablesFile.exists()) {\n    apply from: cordovaVariablesFile\n}|' android/app/capacitor.build.gradle
    echo "✓ Patched capacitor.build.gradle"
  else
    echo "✓ capacitor.build.gradle already has conditional check"
  fi
fi

echo "===== Verifying generated files ====="
if [ -d "android/capacitor-cordova-android-plugins" ]; then
  echo "✓ capacitor-cordova-android-plugins directory exists"
  ls -la android/capacitor-cordova-android-plugins/

  # Check all required files
  MISSING_FILES=""

  if [ ! -f "android/capacitor-cordova-android-plugins/build.gradle" ]; then
    MISSING_FILES="$MISSING_FILES build.gradle"
  fi

  if [ ! -f "android/capacitor-cordova-android-plugins/cordova.variables.gradle" ]; then
    MISSING_FILES="$MISSING_FILES cordova.variables.gradle"
  fi

  if [ ! -d "android/capacitor-cordova-android-plugins/src" ]; then
    MISSING_FILES="$MISSING_FILES src/"
  fi

  if [ ! -f "android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml" ]; then
    MISSING_FILES="$MISSING_FILES AndroidManifest.xml"
  fi

  if [ -n "$MISSING_FILES" ]; then
    echo "✗ Missing files:$MISSING_FILES"
    echo "Creating complete module structure..."
  else
    echo "✓ All required files exist"
  fi
else
  echo "✗ capacitor-cordova-android-plugins directory NOT FOUND"
  echo "Creating complete module structure..."
  MISSING_FILES="all"
fi

# Create complete module structure if anything is missing
if [ -n "$MISSING_FILES" ]; then
  echo "Creating directory structure..."
  mkdir -p android/capacitor-cordova-android-plugins/src/main/libs
  mkdir -p android/capacitor-cordova-android-plugins/src/main/res
  mkdir -p android/capacitor-cordova-android-plugins/src/main/java

  # Create .gitkeep files
  touch android/capacitor-cordova-android-plugins/src/main/res/.gitkeep
  touch android/capacitor-cordova-android-plugins/src/main/java/.gitkeep

  # Create AndroidManifest.xml
  cat > android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml << 'EOF'
<?xml version='1.0' encoding='utf-8'?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
xmlns:amazon="http://schemas.amazon.com/apk/res/android">
<application  >

</application>

</manifest>
EOF

  # Create build.gradle
  cat > android/capacitor-cordova-android-plugins/build.gradle << 'EOF'
ext {
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? rootProject.ext.androidxAppCompatVersion : '1.7.0'
    cordovaAndroidVersion = project.hasProperty('cordovaAndroidVersion') ? rootProject.ext.cordovaAndroidVersion : '10.1.1'
}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.2'
    }
}

apply plugin: 'com.android.library'

android {
    namespace "capacitor.cordova.android.plugins"
    compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 35
    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 23
        targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 35
        versionCode 1
        versionName "1.0"
    }
    lintOptions {
        abortOnError false
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
}

repositories {
    google()
    mavenCentral()
    flatDir{
        dirs 'src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(dir: 'src/main/libs', include: ['*.jar'])
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "org.apache.cordova:framework:$cordovaAndroidVersion"
    // SUB-PROJECT DEPENDENCIES START

    // SUB-PROJECT DEPENDENCIES END
}

// PLUGIN GRADLE EXTENSIONS START
apply from: "cordova.variables.gradle"
// PLUGIN GRADLE EXTENSIONS END

for (def func : cdvPluginPostBuildExtras) {
    func()
}
EOF

  # Create cordova.variables.gradle
  cat > android/capacitor-cordova-android-plugins/cordova.variables.gradle << 'EOF'
// DO NOT EDIT THIS FILE! IT IS GENERATED EACH TIME "capacitor update" IS RUN
ext {
  cdvMinSdkVersion = project.hasProperty('minSdkVersion') ? rootProject.ext.minSdkVersion : 23
  // Plugin gradle extensions can append to this to have code run at the end.
  cdvPluginPostBuildExtras = []
  cordovaConfig = [:]
}
EOF

  echo "✓ Created complete capacitor-cordova-android-plugins module structure"
  echo "Final structure:"
  ls -la android/capacitor-cordova-android-plugins/
fi

echo "===== Pre-build hook complete ====="
