# Build mihomo (Clash.Meta) as an Android .aar via the STANDARD gomobile
# (golang.org/x/mobile) — distinct from the sagernet gomobile used for libbox.
# Produces clashbox.aar (the enc-capable mihomo core for SLAVE VPN Android).
#
# Prereqs (paths from the K.5.x dev setup; adjust as needed):
#   Go 1.26.x at E:\dev\go ; Android NDK 26.1.10909125 ; JDK 21
#   Standard gomobile+gobind installed to E:\dev\gomobile-std\bin:
#     $env:GOBIN='E:\dev\gomobile-std\bin'
#     go install golang.org/x/mobile/cmd/gomobile@latest
#     go install golang.org/x/mobile/cmd/gobind@latest
#     gomobile init
#   mihomo cloned to E:\dev\src\mihomo on the *Alpha* branch (enc-capable),
#   with this clashbox/ package copied in and `go get golang.org/x/mobile/bind`.
#
# Tags cmfa,with_gvisor match ClashMetaForAndroid's embedding build.
# NOTE (PowerShell 5.1): use the `--%` stop-parsing token, otherwise a flag
# value containing a space (e.g. -ldflags) gets mis-split.

$env:GOROOT = 'E:\dev\go'
$env:GOPATH = 'E:\dev\gopath'
$env:JAVA_HOME = 'E:\dev\jdk\jdk-21.0.11+10'
$env:ANDROID_HOME = 'E:\dev\Android'
$env:ANDROID_NDK_HOME = 'E:\dev\Android\ndk\26.1.10909125'
$env:ANDROID_NDK_ROOT = 'E:\dev\Android\ndk\26.1.10909125'
$env:GOBIN = 'E:\dev\gomobile-std\bin'
$env:Path = "E:\dev\go\bin;E:\dev\gomobile-std\bin;E:\dev\jdk\jdk-21.0.11+10\bin;" + $env:Path

Set-Location E:\dev\src\mihomo
Remove-Item E:\dev\src\mihomo\clashbox.aar -ErrorAction SilentlyContinue
$t0 = Get-Date

# arm64-v8a is the primary ABI; append ,android/arm for armeabi-v7a if needed.
gomobile bind --% -v -target=android/arm64 -androidapi=21 -javapkg=com.slavevpn.clash -tags=cmfa,with_gvisor -o E:\dev\src\mihomo\clashbox.aar ./clashbox

Write-Host "=== exit=$LASTEXITCODE elapsed=$([int]((Get-Date)-$t0).TotalSeconds)s ==="
Get-ChildItem E:\dev\src\mihomo\clashbox.aar -ErrorAction SilentlyContinue |
  Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
# Then copy to the repo:  cp E:\dev\src\mihomo\clashbox.aar apps\android\libs\clashbox.aar
