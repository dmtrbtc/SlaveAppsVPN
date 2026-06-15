# Подпись Android-релиза (R4)

CI (`.github/workflows/android.yml`) собирает **подписанный release-APK**, когда в
репозитории заданы секреты с keystore. Без них сборка падает обратно на debug-APK
(чтобы форки и сборки до настройки не ломались).

> ⚠️ **Keystore — это навсегда.** Подпись определяет идентичность приложения:
> обновления ставятся «поверх» только при ТОЙ ЖЕ подписи. Потеряешь keystore —
> не сможешь выпускать обновления для уже установленных копий (только новая
> установка). Храни `.jks` и пароли в надёжном месте (менеджер паролей + бэкап).

---

## 1. Создать keystore (один раз)

Нужен JDK (`keytool` входит в комплект). Выполни локально:

```bash
keytool -genkeypair -v \
  -keystore slave-release.jks \
  -alias slave \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass "ПРИДУМАЙ_ПАРОЛЬ_ХРАНИЛИЩА" \
  -keypass  "ПРИДУМАЙ_ПАРОЛЬ_КЛЮЧА" \
  -dname "CN=SLAVE VPN, O=SLAVE VPN, C=RU"
```

Получишь файл `slave-release.jks`. Запомни:
- **store password** (`-storepass`) — пароль хранилища,
- **key password** (`-keypass`) — пароль ключа (можно тот же),
- **alias** — `slave`.

## 2. Закодировать keystore в base64

GitHub-секрет хранит текст, поэтому `.jks` кладём как base64.

**Linux / macOS:**
```bash
base64 -w0 slave-release.jks > slave-release.jks.b64
```

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("slave-release.jks")) | Out-File -NoNewline slave-release.jks.b64
```

Скопируй всё содержимое `slave-release.jks.b64` (одна длинная строка).

## 3. Добавить секреты в GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Создай **4 секрета** (имена — точь-в-точь):

| Имя секрета | Значение |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | содержимое `slave-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | пароль хранилища (`-storepass`) |
| `ANDROID_KEY_ALIAS` | `slave` |
| `ANDROID_KEY_PASSWORD` | пароль ключа (`-keypass`) |

## 4. Готово

Следующая сборка по тегу `vX.Y.Z` соберёт **подписанный** `SlaveAppsVPN-Android.apk`.
В логе шага *Configure release signing* будет `Release signing configured.`, а
*Rename APK* покажет `signed=true`.

Проверить подпись готового APK:
```bash
# из Android build-tools
apksigner verify --print-certs SlaveAppsVPN-Android.apk
```

---

## Как это работает в CI

`android.yml` шаг **Configure release signing**:
1. Декодирует `ANDROID_KEYSTORE_BASE64` → `app/release.keystore`.
2. Внедряет `signingConfigs.release` в сгенерированный Capacitor'ом `app/build.gradle`
   (storeFile/passwords читаются из env, переданного из секретов).
3. Привязывает `signingConfig signingConfigs.release` к release-buildType.
4. Сборка идёт через `assembleRelease` (иначе `assembleDebug`).

Секреты не попадают в логи; keystore существует только во время job на раннере.
