package zerotier

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io/fs"
	"net/netip"
	"sort"
	"strings"
	"time"
)

// ErrStateNotFound reports that a persistent state object is absent.
var ErrStateNotFound = errors.New("ZeroTier state object not found")

const (
	// identitySecretStateName is the persistent secret identity object.
	identitySecretStateName = "identity.secret"
	// identityPublicStateName is the persistent public identity object.
	identityPublicStateName = "identity.public"
	// identityCollisionBackupStateName preserves a secret identity rejected for
	// colliding with an existing node address.
	identityCollisionBackupStateName = "identity.secret.saved_after_collision"
)

const (
	// PeerCacheCleanupInterval is the official interval between stale peer
	// cache cleanup passes.
	PeerCacheCleanupInterval = time.Hour

	// PeerCacheExpiration is the official maximum age of a persisted peer
	// cache entry.
	PeerCacheExpiration = 30 * 24 * time.Hour
)

// StateStore persists opaque node state. A Node serializes store calls and
// treats persistence mutations as best effort, matching the official core.
// Store methods must not call back into the Node invoking them.
// The same store must not be shared by concurrently active Nodes unless the
// implementation provides its own synchronization.
type StateStore interface {
	Get(name string) ([]byte, error)
	Put(name string, value []byte) error
	Delete(name string) error
}

// RotateIdentityState preserves the current secret identity under the
// official collision backup name and removes the active identity objects. A
// subsequently created Node will generate a new identity. The caller must
// first close the Node using store so no state operations can race rotation.
func RotateIdentityState(store StateStore) error {
	if store == nil {
		return errors.New("nil ZeroTier state store")
	}
	secret, err := store.Get(identitySecretStateName)
	if errors.Is(err, ErrStateNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read collided identity: %w", err)
	}
	if len(secret) == 0 {
		return nil
	}
	var rotateErr error
	if err = store.Put(identityCollisionBackupStateName, secret); err != nil {
		rotateErr = errors.Join(rotateErr, fmt.Errorf("save collided identity: %w", err))
	}
	if err = store.Delete(identitySecretStateName); err != nil {
		rotateErr = errors.Join(rotateErr, fmt.Errorf("remove collided secret identity: %w", err))
	}
	if err = store.Delete(identityPublicStateName); err != nil {
		rotateErr = errors.Join(rotateErr, fmt.Errorf("remove collided public identity: %w", err))
	}
	return rotateErr
}

type peerCacheMaintenance interface {
	CleanPeerCache(time.Time) error
}

// StateFS extends the standard io/fs.FS contract with the mutations required
// by a persistent state store.
type StateFS interface {
	fs.FS
	WriteFile(name string, data []byte, perm fs.FileMode) error
	Remove(name string) error
}

// MemoryStore is an unsynchronized in-memory StateStore for one active Node.
type MemoryStore struct {
	data map[string][]byte
}

// NewMemoryStore returns an empty in-memory state store for one Node.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{data: make(map[string][]byte)}
}

// Get returns an independently owned state value or ErrStateNotFound.
func (s *MemoryStore) Get(name string) ([]byte, error) {
	value, ok := s.data[name]
	if !ok {
		return nil, ErrStateNotFound
	}
	return append([]byte(nil), value...), nil
}

// Put stores an independently owned copy of value.
func (s *MemoryStore) Put(name string, value []byte) error {
	s.data[name] = append([]byte(nil), value...)
	return nil
}

// Delete removes name and succeeds when it is already absent.
func (s *MemoryStore) Delete(name string) error {
	delete(s.data, name)
	return nil
}

// FileStore persists node state through an embedding-provided filesystem.
// Like the official state callback, Get reports a failed read that returned no
// data as ErrStateNotFound because the core cannot distinguish I/O errors from
// a missing state object.
type FileStore struct {
	fs StateFS
}

// NewFileStore adapts a StateFS to StateStore.
func NewFileStore(fileSystem StateFS) (*FileStore, error) {
	if fileSystem == nil {
		return nil, errors.New("nil ZeroTier state filesystem")
	}
	return &FileStore{fs: fileSystem}, nil
}

// Get reads one validated state object through the supplied filesystem.
func (s *FileStore) Get(name string) ([]byte, error) {
	if err := validateStateName(name); err != nil {
		return nil, err
	}
	value, err := fs.ReadFile(s.fs, name)
	if len(value) != 0 {
		return value, nil
	}
	if err != nil {
		return nil, ErrStateNotFound
	}
	return value, nil
}

// Put writes one validated state object with owner-only permissions.
func (s *FileStore) Put(name string, value []byte) error {
	if err := validateStateName(name); err != nil {
		return err
	}
	return s.fs.WriteFile(name, value, 0600)
}

// Delete removes one validated state object and accepts an absent file.
func (s *FileStore) Delete(name string) error {
	if err := validateStateName(name); err != nil {
		return err
	}
	err := s.fs.Remove(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

// CleanPeerCache removes official peer cache files older than
// PeerCacheExpiration. Missing directories are accepted, and unrelated files,
// directories, symbolic links, and other special files are left untouched.
// Per-entry failures are joined after the remaining entries are inspected. As
// with other StateStore operations, callers must serialize access; Node does
// this automatically from ProcessBackgroundTasks.
func (s *FileStore) CleanPeerCache(now time.Time) error {
	entries, err := fs.ReadDir(s.fs, "peers.d")
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect ZeroTier peer cache: %w", err)
	}
	cutoff := now.Add(-PeerCacheExpiration)
	var cleanupErr error
	for _, entry := range entries {
		name := entry.Name()
		if len(name) != 15 || name[10:] != ".peer" || !entry.Type().IsRegular() {
			continue
		}
		address, parseErr := ParseAddress(name[:10])
		if parseErr != nil || peerCacheName(address) != "peers.d/"+name {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect ZeroTier peer cache file %s: %w", name, infoErr))
			continue
		}
		if !info.Mode().IsRegular() || info.ModTime().IsZero() || !info.ModTime().Before(cutoff) {
			continue
		}
		if removeErr := s.fs.Remove(peerCacheName(address)); removeErr != nil && !errors.Is(removeErr, fs.ErrNotExist) {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("remove expired ZeroTier peer cache file %s: %w", name, removeErr))
		}
	}
	return cleanupErr
}

// maintainPeerCacheLocked runs best-effort stale cache cleanup when due.
func (n *Node) maintainPeerCacheLocked(now time.Time) {
	if n.peerCacheMaintenance == nil || (!n.lastPeerCacheCleanup.IsZero() && now.Sub(n.lastPeerCacheCleanup) < PeerCacheCleanupInterval) {
		return
	}
	n.lastPeerCacheCleanup = now
	_ = n.peerCacheMaintenance.CleanPeerCache(now)
}

// peerCacheMaintenanceDeadlineLocked returns the next useful cleanup time.
func (n *Node) peerCacheMaintenanceDeadlineLocked() (time.Time, bool) {
	if n.peerCacheMaintenance == nil {
		return time.Time{}, false
	}
	if n.lastPeerCacheCleanup.IsZero() {
		return time.Time{}, true
	}
	return n.lastPeerCacheCleanup.Add(PeerCacheCleanupInterval), true
}

// validateStateName rejects paths outside the relative StateFS namespace.
func validateStateName(name string) error {
	if !fs.ValidPath(name) || strings.ContainsRune(name, '\\') {
		return errors.New("invalid ZeroTier state object name")
	}
	return nil
}

// peerCacheName returns the official state object name for a cached peer.
func peerCacheName(address Address) string {
	return "peers.d/" + address.String() + ".peer"
}

// savePeerCacheLocked persists every active learned peer during shutdown.
func (n *Node) savePeerCacheLocked() {
	addresses := make([]Address, 0, n.learnedPeerCountLocked())
	for address, peer := range n.peers {
		if !peer.root {
			addresses = append(addresses, address)
		}
	}
	sort.Slice(addresses, func(i, j int) bool { return addresses[i] < addresses[j] })
	if len(addresses) > maxLearnedPeers {
		addresses = addresses[:maxLearnedPeers]
	}
	for _, address := range addresses {
		n.savePeerLocked(n.peers[address])
	}
}

// savePeerLocked serializes one non-root peer and its candidate endpoints.
func (n *Node) savePeerLocked(peer *peer) {
	if peer == nil || peer.root {
		return
	}
	paths := make([]netip.AddrPort, 0, len(peer.paths))
	seen := make(map[netip.AddrPort]struct{}, cap(paths))
	for key := range peer.paths {
		if _, exists := seen[key.endpoint]; !exists {
			seen[key.endpoint] = struct{}{}
			paths = append(paths, key.endpoint)
		}
	}
	sort.Slice(paths, func(i, j int) bool {
		if comparison := paths[i].Addr().Compare(paths[j].Addr()); comparison != 0 {
			return comparison < 0
		}
		return paths[i].Port() < paths[j].Port()
	})
	if len(paths) > maxPeerPaths {
		paths = paths[:maxPeerPaths]
	}
	data := make([]byte, 0, 1+serializedIdentitySize+10+len(paths)*20)
	data = append(data, 2) // Peer::serializeForCache version.
	data = peer.identity.AppendBinary(data, false)
	data = binary.BigEndian.AppendUint16(data, uint16(peer.protocol))
	data = binary.BigEndian.AppendUint16(data, uint16(peer.major))
	data = binary.BigEndian.AppendUint16(data, uint16(peer.minor))
	data = binary.BigEndian.AppendUint16(data, peer.revision)
	data = binary.BigEndian.AppendUint16(data, uint16(len(paths)))
	for _, endpoint := range paths {
		data = appendInetAddress(data, endpoint)
	}
	_ = n.store.Put(peerCacheName(peer.identity.Address()), data)
}

// loadPeerCacheLocked restores and validates one learned peer cache entry.
func (n *Node) loadPeerCacheLocked(address Address, now time.Time) *peer {
	if address.IsZero() || address.IsReserved() || address == n.identity.Address() {
		return nil
	}
	if known := n.peers[address]; known != nil {
		return known
	}
	data, err := n.store.Get(peerCacheName(address))
	if err != nil || len(data) < 1 || data[0] != 2 {
		return nil
	}
	identity, consumed, parseErr := ParseIdentityBinary(data[1:])
	if parseErr != nil || identity.Address() != address || identity.HasPrivate() || identity.Validate() != nil {
		return nil
	}
	pos := 1 + consumed
	if len(data)-pos < 10 {
		return nil
	}
	protocol := binary.BigEndian.Uint16(data[pos:])
	major := binary.BigEndian.Uint16(data[pos+2:])
	minor := binary.BigEndian.Uint16(data[pos+4:])
	revision := binary.BigEndian.Uint16(data[pos+6:])
	pathCount := int(binary.BigEndian.Uint16(data[pos+8:]))
	pos += 10
	if protocol > 255 || major > 255 || minor > 255 || pathCount > maxPeerPaths {
		return nil
	}
	paths := make([]netip.AddrPort, 0, pathCount)
	for i := 0; i < pathCount; i++ {
		endpoint, consumed, valid := parsePeerCacheEndpoint(data[pos:])
		if consumed <= 0 {
			break
		}
		pos += consumed
		if valid {
			paths = append(paths, endpoint)
		}
	}
	loaded, err := n.newPeerLocked(identity, false)
	if err != nil {
		return nil
	}
	loaded.protocol = uint8(protocol)
	loaded.major = uint8(major)
	loaded.minor = uint8(minor)
	loaded.revision = revision
	n.peers[address] = loaded
	seen := make(map[netip.AddrPort]struct{}, len(paths))
	for _, endpoint := range paths {
		if _, exists := seen[endpoint]; exists || !n.pathAllowedLocked(loaded, endpoint) {
			continue
		}
		seen[endpoint] = struct{}{}
		// The official core probes cached paths during peer deserialization
		// instead of restoring them as authenticated paths.
		_ = n.sendHelloLocked(address, endpoint, now)
	}
	n.peerAddedLocked(loaded, now)
	return loaded
}

// parsePeerCacheEndpoint decodes one cached physical endpoint and its encoded
// length.
func parsePeerCacheEndpoint(data []byte) (netip.AddrPort, int, bool) {
	if len(data) == 0 {
		return netip.AddrPort{}, 0, false
	}
	switch data[0] {
	case 0:
		return netip.AddrPort{}, 1, false
	case 1, 2:
		if len(data) < 7 {
			return netip.AddrPort{}, 0, false
		}
		return netip.AddrPort{}, 7, false
	case 3:
		if len(data) < 3 {
			return netip.AddrPort{}, 0, false
		}
		length := int(binary.BigEndian.Uint16(data[1:])) + 3
		if len(data) < length {
			return netip.AddrPort{}, 0, false
		}
		return netip.AddrPort{}, length, false
	case 4, 6:
		endpoint, consumed, err := parseInetAddress(data)
		return endpoint, consumed, err == nil && endpoint.IsValid()
	default:
		return netip.AddrPort{}, 0, false
	}
}
