package artifacts

import (
	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
)

// Publisher receives artifact lifecycle events. The SSE hub (S1-05) provides
// the real implementation; tests use fakes.
type Publisher interface {
	PublishScriptValidated(videoID, slug string)
	PublishScenesValidated(videoID, slug string, valid bool)
}

// NoopPublisher discards events.
type NoopPublisher struct{}

func (NoopPublisher) PublishScriptValidated(videoID, slug string)             {}
func (NoopPublisher) PublishScenesValidated(videoID, slug string, valid bool) {}

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

// PublishScenesValidated announces the outcome of scene grammar validation on
// both branches (accepted → scenes_review; rejected → stays scenes_pending).
func (h HubPublisher) PublishScenesValidated(videoID, slug string, valid bool) {
	if h.Hub == nil {
		return
	}
	evt := &studiov1.StudioEvent{
		Event: &studiov1.StudioEvent_ScenesValidated{
			ScenesValidated: &studiov1.ScenesValidated{
				VideoId: videoID,
				Slug:    slug,
				Valid:   valid,
			},
		},
	}
	h.Hub.Publish(events.TopicGlobal, evt)
	h.Hub.Publish(events.TopicForVideo(videoID), evt)
}
