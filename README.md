# Question Bank App

Maintainable source for the empty-shell Android question-bank app.

- The app contains no bundled question bank. A fresh install starts with zero questions.
- JSON import, domain exports, full backup, Legacy Backup migration, progress, favorites, wrong questions, and slashed-question recovery remain available.
- The release application ID is `com.questionbank`; debug alone adds `.recovered`.
- Medical question content is maintained outside this repository. The local Skill defines and validates the import contract.

## Build and test

Local build prerequisites used during recovery:

- JDK 21
- Android SDK 36
- Gradle 9.1 / Android Gradle Plugin 9.0.1

Run `npm test` and `gradlew.bat test lint assembleDebug`. Set `JAVA_HOME` and `ANDROID_HOME` if they are not already configured.

## Release signing

The release alias is fixed to `questionbank-release`. Keystores and passwords stay outside Git.

1. Run `tools/signing/create-release-keystore.ps1`; `keytool` prompts locally for passwords.
2. Set `QBANK_RELEASE_STORE_FILE`, `QBANK_RELEASE_STORE_PASSWORD`, and `QBANK_RELEASE_KEY_PASSWORD` in the local build environment.
3. Run `gradlew.bat assembleRelease`.

Release tasks fail when any signing environment variable is missing. Never place the keystore or passwords in this repository.

## State model

`app/src/main/assets/state-model.js` contains the pure chapter-state operations used by the WebView UI. Persisted app state is version 2 and adds an independent `slashed` question-ID array. Loading a version 1 backup preserves the existing answers, history, wrong questions, favorites, resume point, totals, statistics, and settings while initializing `slashed` to an empty array.

The Android `test` task also runs the JavaScript suite before its unit-test lifecycle.
