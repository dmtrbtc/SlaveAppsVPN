/**
 * Release artifacts trusted by the packaging and validation scripts.
 *
 * Keep the archive digest equal to the digest published by GitHub Releases.
 * The binary digest is calculated from the verified archive and prevents an
 * already-installed executable from silently surviving a version bump.
 */
export const MIHOMO_WINDOWS = Object.freeze({
  version: 'v1.19.30',
  releaseCommit: 'ac017cd',
  url: 'https://github.com/MetaCubeX/mihomo/releases/download/v1.19.30/mihomo-windows-amd64-v1.19.30.zip',
  archive: 'zip',
  archiveSha256: '22c09fd67673895ef7cd6b1820563918275c3d316f2462b306208675118db3c0',
  binarySha256: 'f55b3028d9160beb9044f21b05dd7405b46524614a19642d6291492f5f985761',
  archiveMember: /mihomo-windows-amd64\.exe$/,
  outName: 'mihomo.exe',
})
