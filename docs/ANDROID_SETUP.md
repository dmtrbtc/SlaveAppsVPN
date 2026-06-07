# Android Setup — Шаг за шагом

> Чтобы собрать APK локально (без полного Android Studio).
> После выполнения этих шагов вернись в чат — Claude доделает остальное.

---

## Что в результате

- **Этап 1 (этот документ):** установка JDK + Android SDK + env vars
- **Этап 2 (после твоей установки, делаю я):** `pnpm cap add android`, копирование Kotlin plugin, gradle build, debug APK
- **Этап 3 (отдельная задача, ~1 неделя):** интеграция реального VPN engine через
  libbox.aar (sing-box mobile)

**После этапа 2** APK будет показывать наш React UI на телефоне. **VPN кнопки
не будут работать** — они вернут "Not implemented" пока не сделан этап 3.
Это нормально для UI testing.

---

## 1. JDK 17 (15 минут)

### Вариант A — Скачать .msi (рекомендую)

1. Перейди: https://adoptium.net/temurin/releases/?version=17&package=jdk&os=windows&arch=x64
2. Скачай **Windows x64 → MSI Installer** (`OpenJDK17U-jdk_x64_windows_hotspot-17.0.x.msi`, ~150 MB)
3. Запусти, установи в **C:\Program Files\Eclipse Adoptium\jdk-17\** (или другую, путь запомни)
4. **Важно:** в установщике на шаге "Custom Setup" включи галки:
   - ✅ Add to PATH
   - ✅ Set JAVA_HOME variable

### Вариант B — Через winget (PowerShell от админа)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

### Проверка

Открой новый терминал (PowerShell или Git Bash) и выполни:

```bash
java -version
# должно вывести: openjdk version "17.0.x"
echo $JAVA_HOME   # bash/zsh
$env:JAVA_HOME    # PowerShell
# должно вывести путь к JDK
```

Если `JAVA_HOME` пустой — установи вручную через:
- Win+R → `sysdm.cpl` → Environment Variables
- Добавь `JAVA_HOME` = `C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot`
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
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

После установки `adb` должен работать:

```bash
adb version
# должно вывести: Android Debug Bridge version 1.0.41
```

---

## 3. Что НЕ нужно для UI-only APK

Если ты хочешь **только UI APK** (без VPN engine), всё готово. Переходи к секции 5.

Для **полного APK с VPN** дополнительно нужно (НО это отдельная задача):
- Android NDK: `sdkmanager "ndk;26.1.10909125"` (~1 GB)
- Go 1.22+ (для `gomobile bind`)
- ~1 час на сборку libbox.aar из sing-box source

Эту часть Claude сделает в отдельной сессии (Phase K.5+) когда базовый APK
будет собран и протестирован.

---

## 4. Telegram-style alternative — Hiddify-Next (ZERO setup)

Если установка JDK+SDK кажется лишним — просто скачай **Hiddify-Next** APK
прямо сейчас:

https://github.com/hiddify/hiddify-next/releases/latest

Это готовый Android клиент. Скопируй VLESS URL из подписки → вставь.
Работает с теми же серверами что и наш Windows билд. Минус — не наш UI.

---

## 5. Готово — что дальше

Когда `sdkmanager --version` и `adb version` работают, напиши в чат
**"SDK готов"** и Claude:

1. Запустит `pnpm cap add android` в `apps/android/`
2. Скопирует sample Kotlin plugin в нативный проект
3. Настроит AndroidManifest (permissions, service)
4. Скачает иконки, splash screen
5. `gradle assembleDebug` → APK
6. Подпишет debug ключом
7. Загрузит APK в GitHub release `v0.2.0-rc1-android`

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
- JDK 17 не на PATH, или есть конфликт со старым JRE
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
- Если место критично — можно после сборки удалить `C:\Android\platforms\android-34\` (~700 MB), оставив только `build-tools` и `platform-tools`

---

## Полная команда установки в одном PowerShell блоке

Если ты в PowerShell от админа и есть winget:

```powershell
# JDK 17
winget install EclipseAdoptium.Temurin.17.JDK --silent

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
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

После этого `sdkmanager --version` + `adb version` должны работать.
Пиши "SDK готов" — продолжаем.
