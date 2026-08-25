package events

import (
	"testing"
	"time"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

func newEvent(n int) *studiov1.StudioEvent {
	return &studiov1.StudioEvent{
		Event: &studiov1.StudioEvent_WatcherPostFound{
			WatcherPostFound: &studiov1.WatcherPostFound{Slug: "post-" + time.Now().Format("150405.000000000")},
		},
	}
}

func TestHubSubscribePublishCancel(t *testing.T) {
	hub := NewHub()
	ch, cancel := hub.Subscribe(TopicGlobal, TopicForVideo("abc"))
	defer cancel()

	hub.Publish(TopicGlobal, newEvent(1))
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("event not received on subscribed topic")
	}

	hub.Publish(TopicForVideo("other"), newEvent(2))
	select {
	case evt := <-ch:
		t.Fatalf("received event from unsubscribed topic: %v", evt)
	case <-time.After(50 * time.Millisecond):
	}

	cancel()
	cancel() // idempotent
	if _, ok := <-ch; ok {
		t.Error("channel should be closed after cancel")
	}
}

func TestHubSlowConsumerDropsInsteadOfBlocking(t *testing.T) {
	hub := NewHub()
	ch, cancel := hub.Subscribe(TopicGlobal)
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 64+10; i++ { // buffer is 32; far beyond it
			hub.Publish(TopicGlobal, newEvent(i))
		}
	}()

	select {
	case <-done:
		// Publishing completed without blocking — drops happened, no deadlock.
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on slow consumer")
	}

	// Drain a bit and cancel cleanly.
	for len(ch) > 0 {
		<-ch
	}
}
