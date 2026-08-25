package artifacts

// Publisher receives artifact lifecycle events. The SSE hub (S1-05) provides
// the real implementation; tests use fakes.
type Publisher interface {
	PublishScriptValidated(videoID, slug string)
}

// NoopPublisher discards events.
type NoopPublisher struct{}

func (NoopPublisher) PublishScriptValidated(videoID, slug string) {}
