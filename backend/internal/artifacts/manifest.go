package artifacts

// FileManifestEntry describes one input file of a render job (S5-04).
type FileManifestEntry struct {
	Path   string `json:"path"`
	Sha256 string `json:"sha256"`
	Bytes  uint64 `json:"bytes"`
}
