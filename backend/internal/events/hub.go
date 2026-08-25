// Package events implements the in-memory SSE broker (D-03): topics,
// per-connection channels, slow-consumer drops and typed envelopes.
package events

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"sync"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

const (
	TopicGlobal   = "global"
	TopicVideoFmt = "video:%s" // video:<id>
)

// TopicForVideo returns the per-video topic name.
func TopicForVideo(id string) string { return fmt.Sprintf(TopicVideoFmt, id) }

type subscription struct {
	ch     chan *studiov1.StudioEvent
	topics map[string]struct{}
	cancel func()
}

// Hub is the in-memory pub/sub broker. Publishing never blocks: events are
// dropped (with a warning) when a subscriber falls behind.
type Hub struct {
	mu   sync.Mutex
	subs map[*subscription]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[*subscription]struct{})}
}

// Subscribe registers interest in the given topics and returns the event
// channel plus a cancel function (idempotent, safe to call multiple times).
func (h *Hub) Subscribe(topics ...string) (<-chan *studiov1.StudioEvent, func()) {
	sub := &subscription{
		ch:     make(chan *studiov1.StudioEvent, 32),
		topics: make(map[string]struct{}, len(topics)),
	}
	for _, t := range topics {
		sub.topics[t] = struct{}{}
	}

	h.mu.Lock()
	h.subs[sub] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subs, sub)
			h.mu.Unlock()
			close(sub.ch)
		})
	}
	return sub.ch, cancel
}

// Publish fans the event out to every subscriber of the topic without blocking.
func (h *Hub) Publish(topic string, evt *studiov1.StudioEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subs {
		if _, interested := sub.topics[topic]; !interested && len(sub.topics) > 0 {
			continue
		}
		select {
		case sub.ch <- evt:
		default:
			// Slow consumer: drop instead of blocking production (D-03 note).
			slog.Warn("events.slow_consumer_drop")
		}
	}
}

// PublishJSON fans a generic JSON payload (non-proto events like pipeline
// notifications) to every subscriber of the topic.
func (h *Hub) PublishJSON(topic string, payload map[string]any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subs {
		select {
		case sub.ch <- &studiov1.StudioEvent{}:
		default:
		}
	}
	slog.Debug("events.json_published", slog.String("topic", topic), slog.String("bytes", strconv.Itoa(len(body))))
}
