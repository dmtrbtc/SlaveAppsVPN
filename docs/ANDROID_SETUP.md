# Android Setup — Шаг за шагом

> Чтобы собрать APK локально (без полного Android Studio).

---

## Что в результате

- **Этап 1 (этот документ):** установка JDK + Android SDK + env vars
- **Этап 2:** синхронизация Capacitor, Android Lint и сборка debug APK
- **VPN engine:** Mihomo `v1.19.30` уже подключён из проверенного
  `apps/android/libs/clashbox.aar` к committed Gradle-проекту

Kotlin plugin, `VpnService`, Quick Settings tile и boot receiver входят в
обычную Gradle-сборку напрямую из `apps/android/sample-native/`.

---

## 1. JDK 21 (15 минут)

### Вариант A — Скачать .msi (рекомендую)

1. Перейди: https://adoptium.net/temurin/releases/?version=21&package=jdk&os=windows&arch=x64
2. Скачай **Windows x64 → MSI Installer** (`OpenJDK21U-jdk_x64_windows_hotspot-21.0.x.msi`, ~200 MB)
3. Запусти, установи в **C:\Program Files\Eclipse Adoptium\jdk-21\** (или другую, путь запомни)
4. **Важно:** в установщике на шаге "Custom Setup" включи галки:
   - ✅ Add to PATH
   - ✅ Set JAVA_HOME variable

### Вариант B — Через winget (PowerShell от админа)

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
```

### Проверка

Открой новый терминал (PowerShell или Git Bash) и выполни:

```bash
java -version
# должно вывести: openjdk version "21.0.x"
echo $JAVA_HOME   # bash/zsh
$env:JAVA_HOME    # PowerShell
# должно вывести путь к JDK
```

Если `JAVA_HOME` пустой — установи вручную через:
- Win+R → `sysdm.cpl` → Environment Variables
- Добавь `JAVA_HOME` = `C:\Program Files\Eclipse Adoptium\jdk-21.0.x.x-hotspot`
- В `Path` добавь `%JAVA_HOME%\bin`

---

## 2. Android Command Line Tools (15 минут)

Без полного Android Studio, экономия ~3 GB.

### Скачивание

1. Перейди: https://developer.android.com/studio#command-line-tools-only
2. Скачай **commandlinetools-win-XXXXXX_latest.zip** (~110 MB)
3. Распакуй так чтобы получилось:
   ```
   C:\Android\cmdline-tools\latest\bin\sdkmanager.bat
   C:\Android\cmdline-tools\latest\bin\avdmanager.bat
   C:\Android\cmdline-tools\latest\lib\...
   ```
   **Важно:** именно `cmdline-tools\latest\` — без `latest` в пути sdkmanager откажется работать.

### Env vars

В PowerShell от админа:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Android", "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "C:\Android", "User")
$path = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$path;C:\Android\cmdline-tools\latest\bin;C:\Android\platform-tools", "User")
```

Открой **новый** терминал и проверь:

```bash
sdkmanager --version
# должно вывести: 11.0 (или новее)
```

### Установка SDK компонентов

В терминале (новый, чтобы PATH обновился):

```bash
# Принять лицензии (нажми y несколько раз)
sdkmanager --licenses

# Установить базовый набор (~1.5 GB total)
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

После установки `adb` должен работать:

```bash
adb version
# должно вывести: Android Debug Bridge version 1.0.41
```

---

## 3. Нативный VPN core

Для обычной сборки APK Go и NDK не нужны: готовый AAR уже находится в
репозитории и уже подключён из committed app module через
`implementation files('../../libs/clashbox.aar')`.

Только для пересборки самого AAR нужны:
- Android NDK: `sdkmanager "ndk;26.1.10909125"` (~1 GB)
- Go `1.26.6`
- JDK 21
- зафиксированные `gomobile`/`gobind`

Точные версии, checksum и команда воспроизводимой сборки указаны в
`apps/android/libs/README.md`.

---

## 4. Telegram-style alternative — Hiddify-Next (ZERO setup)

Если установка JDK+SDK кажется лишним — просто скачай **Hiddify-Next** APK
прямо сейчас:

https://github.com/hiddify/hiddify-next/releases/latest

Это готовый Android клиент. Скопируй VLESS URL из подписки → вставь.
Работает с теми же серверами что и наш Windows билд. Минус — не наш UI.

---

## 5. Готово — что дальше

Когда `sdkmanager --version` и `adb version` работают, следующие шаги:

1. `pnpm --filter @slave-vpn/windows build`
2. `pnpm --dir apps/android exec cap sync android`
3. `pnpm --filter @slave-vpn/android lint:android`
4. `pnpm --filter @slave-vpn/android build:android:debug`
5. Установить APK из `apps/android/android/app/build/outputs/apk/debug/`
6. Прогнать smoke-тест на физическом ARM-устройстве; публикацию выполнять
   только после проверки release-подписи, VPN lifecycle и сетевого трафика

APK можно ставить на телефон через:
- Скачать с release page на телефон → открыть → разрешить установку из неизвестных источников
- Или `adb install slavevpn-debug.apk` если телефон в USB-debug режиме

---

## Troubleshooting

### "sdkmanager: command not found"
- Не обновился PATH. Открой **новый** терминал (или logout/login Windows)

### "Warning: Could not create settings"
- sdkmanager в неправильном пути. Должно быть `C:\Android\cmdline-tools\latest\bin\sdkmanager.bat`
- Не `C:\Android\cmdline-tools\bin\` (без `latest`)

### "java.lang.NoClassDefFoundError" при запуске sdkmanager
- JDK 21 не на PATH, или есть конфликт со старым JRE
- В терминале: `where java` (PowerShell `Get-Command java`) — должно показывать **только** Adoptium

### "gradle: command not found"
- Не нужно! Capacitor генерит `gradlew` (Gradle wrapper) в `apps/android/android/`
- Wrapper сам качает нужную версию gradle при первом запуске

### "License for package XYZ not accepted"
```bash
sdkmanager --licenses
# нажимай y для каждой лицензии
```

### Установка займёт > 1 ГБ места
- Это нормально для базового SDK
- Если место критично — можно после сборки удалить старые, неиспользуемые SDK platforms, оставив `android-35`

---

## Полная команда установки в одном PowerShell блоке

Если ты в PowerShell от админа и есть winget:

```powershell
# JDK 21
winget install EclipseAdoptium.Temurin.21.JDK --silent

# Скачать cmdline-tools
$url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$zip = "$env:TEMP\cmdline-tools.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
New-Item -Path "C:\Android\cmdline-tools" -ItemType Directory -Force | Out-Null
Expand-Archive -Path $zip -DestinationPath "C:\Android\cmdline-tools" -Force
Rename-Item -Path "C:\Android\cmdline-tools\cmdline-tools" -NewName "latest"

# Env vars
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Android", "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "C:\Android", "User")
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if ($path -notmatch "C:\\Android") {
  [Environment]::SetEnvironmentVariable("Path", "$path;C:\Android\cmdline-tools\latest\bin;C:\Android\platform-tools", "User")
}

# !!! Закрой и открой PowerShell !!!
# Затем:
sdkmanager --licenses  # y несколько раз
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

После этого `sdkmanager --version` + `adb version` должны работать.
После этого committed нативный проект готов к `cap sync`, lint и Gradle-сборке.
