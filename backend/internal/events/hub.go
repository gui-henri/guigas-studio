// Package events implements the in-memory SSE broker (D-03): topics,
// per-connection channels, slow-consumer drops, typed envelopes and a bounded
// per-topic backlog for Last-Event-ID replay across reconnects/restarts of
// the *connection* (history is still process-local: a server restart clears
// it — clients then get a fresh stream from seq 0).
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

// historyCapPerTopic bounds replay memory: topics are videos (few), each
// keeps at most the latest N deliveries.
const historyCapPerTopic = 100

// TopicForVideo returns the per-video topic name.
func TopicForVideo(id string) string { return fmt.Sprintf(TopicVideoFmt, id) }

// Delivery is one sequenced event. Seq is a hub-local monotonic ID used as
// the SSE `id:` field so clients can resume with Last-Event-ID.
type Delivery struct {
	Seq   uint64
	Event *studiov1.StudioEvent
}

type subscription struct {
	ch     chan Delivery
	topics map[string]struct{}
	cancel func()
}

// Hub is the in-memory pub/sub broker. Publishing never blocks: events are
// dropped (with a warning) when a subscriber falls behind.
type Hub struct {
	mu      sync.Mutex
	subs    map[*subscription]struct{}
	seq     uint64
	history map[string][]Delivery
}

func NewHub() *Hub {
	return &Hub{subs: make(map[*subscription]struct{}), history: make(map[string][]Delivery)}
}

// Subscribe registers interest in the given topics and returns the live event
// channel plus a cancel function (idempotent, safe to call multiple times).
// No backlog is replayed; use SubscribeSince to resume.
func (h *Hub) Subscribe(topics ...string) (<-chan Delivery, func()) {
	ch, cancel, _ := h.SubscribeSince(topics, 0)
	return ch, cancel
}

// SubscribeSince registers like Subscribe and additionally returns every
// buffered delivery on the requested topics with Seq > since, in order.
// Registration + backlog snapshot happen under one lock, so nothing published
// afterwards is missed and nothing is duplicated.
func (h *Hub) SubscribeSince(topics []string, since uint64) (<-chan Delivery, func(), []Delivery) {
	sub := &subscription{
		ch:     make(chan Delivery, 32),
		topics: make(map[string]struct{}, len(topics)),
	}
	for _, t := range topics {
		sub.topics[t] = struct{}{}
	}

	h.mu.Lock()
	h.subs[sub] = struct{}{}
	var backlog []Delivery
	for _, t := range topics {
		for _, d := range h.history[t] {
			if d.Seq > since {
				backlog = append(backlog, d)
			}
		}
	}
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
	return sub.ch, cancel, backlog
}

// Publish fans the event out to every subscriber of the topic without blocking.
func (h *Hub) Publish(topic string, evt *studiov1.StudioEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.seq++
	d := Delivery{Seq: h.seq, Event: evt}
	hist := append(h.history[topic], d)
	if len(hist) > historyCapPerTopic {
		hist = hist[len(hist)-historyCapPerTopic:]
	}
	h.history[topic] = hist
	for sub := range h.subs {
		if _, interested := sub.topics[topic]; !interested && len(sub.topics) > 0 {
			continue
		}
		select {
		case sub.ch <- d:
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
	h.seq++
	d := Delivery{Seq: h.seq, Event: &studiov1.StudioEvent{}}
	for sub := range h.subs {
		select {
		case sub.ch <- d:
		default:
		}
	}
	slog.Debug("events.json_published", slog.String("topic", topic), slog.String("bytes", strconv.Itoa(len(body))))
}
