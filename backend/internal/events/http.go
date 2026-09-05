package events

import (
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
)

// heartbeatInterval keeps idle connections alive through proxies.
const heartbeatInterval = 25 * time.Second

// HTTPHandler serves GET /api/events?topic=global|video:<id> as a
// text/event-stream, authenticated with a Bearer JWT (D-03).
// Resume: ?last_event_id=<seq> (or the Last-Event-ID header) replays the
// bounded per-topic backlog before live events.
func HTTPHandler(hub *Hub, verifyToken middleware.VerifyToken) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !middleware.AuthorizeBearer(r.Header.Get("Authorization"), verifyToken) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		topic := r.URL.Query().Get("topic")
		if topic == "" {
			topic = TopicGlobal
		}
		since := parseLastEventID(r)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		eventsCh, cancel, backlog := hub.SubscribeSince([]string{topic}, since)
		defer cancel()

		ctx := r.Context()
		heartbeat := time.NewTicker(heartbeatInterval)
		defer heartbeat.Stop()

		// Immediate comment so clients/proxies see the stream open.
		io.WriteString(w, ": connected\n\n")
		flusher.Flush()

		write := func(d Delivery) bool {
			line, err := marshalSSE(d)
			if err != nil {
				return true
			}
			if _, err := io.WriteString(w, line); err != nil {
				return false
			}
			flusher.Flush()
			return true
		}

		// Bounded backlog first (resume), then live.
		for _, d := range backlog {
			if !write(d) {
				return
			}
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-heartbeat.C:
				if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
					return
				}
				flusher.Flush()
			case d, ok := <-eventsCh:
				if !ok {
					return
				}
				if !write(d) {
					return
				}
			}
		}
	}
}

// parseLastEventID reads the resume cursor from ?last_event_id= (preferred,
// works with the fetch-based client) or the Last-Event-ID header (native
// EventSource). Invalid values resume from 0 (bounded backlog).
func parseLastEventID(r *http.Request) uint64 {
	raw := r.URL.Query().Get("last_event_id")
	if raw == "" {
		raw = r.Header.Get("Last-Event-ID")
	}
	if raw == "" {
		return 0
	}
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0
	}
	return n
}
