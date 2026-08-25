package artifacts

import (
	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
)

// Publisher receives artifact lifecycle events. The SSE hub (S1-05) provides
// the real implementation; tests use fakes.
type Publisher interface {
	PublishScriptValidated(videoID, slug string)
}

// NoopPublisher discards events.
type NoopPublisher struct{}

func (NoopPublisher) PublishScriptValidated(videoID, slug string) {}

// HubPublisher bridges observer events into the SSE broker.
type HubPublisher struct {
	Hub *events.Hub
}

func (h HubPublisher) PublishScriptValidated(videoID, slug string) {
	if h.Hub == nil {
		return
	}
	evt := &studiov1.StudioEvent{
		Event: &studiov1.StudioEvent_ScriptValidated{
			ScriptValidated: &studiov1.ScriptValidated{
				VideoId: videoID,
				Slug:    slug,
				Valid:   true,
			},
		},
	}
	h.Hub.Publish(events.TopicGlobal, evt)
	h.Hub.Publish(events.TopicForVideo(videoID), evt)
}
