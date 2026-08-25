package events

import (
	"io"
	"net/http"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
)

// heartbeatInterval keeps idle connections alive through proxies.
const heartbeatInterval = 25 * time.Second

// HTTPHandler serves GET /api/events?topic=global|video:<id> as a
// text/event-stream, authenticated with a Bearer JWT (D-03).
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

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		eventsCh, cancel := hub.Subscribe(topic)
		defer cancel()

		ctx := r.Context()
		heartbeat := time.NewTicker(heartbeatInterval)
		defer heartbeat.Stop()

		// Immediate comment so clients/proxies see the stream open.
		io.WriteString(w, ": connected\n\n")
		flusher.Flush()

		for {
			select {
			case <-ctx.Done():
				return
			case <-heartbeat.C:
				if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
					return
				}
				flusher.Flush()
			case evt, ok := <-eventsCh:
				if !ok {
					return
				}
				line, err := marshalSSE(evt)
				if err != nil {
					continue
				}
				if _, err := io.WriteString(w, line); err != nil {
					return
				}
				flusher.Flush()
			}
		}
	}
}
