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

func TestHubSubscribeSinceReplaysBacklog(t *testing.T) {
	hub := NewHub()
	hub.Publish(TopicGlobal, newEvent(1))
	hub.Publish(TopicGlobal, newEvent(2))
	hub.Publish(TopicForVideo("other"), newEvent(3))

	_, cancel, backlog := hub.SubscribeSince([]string{TopicGlobal}, 0)
	defer cancel()
	if len(backlog) != 2 {
		t.Fatalf("backlog = %d deliveries, want 2 (topic-scoped)", len(backlog))
	}
	if backlog[0].Seq == 0 || backlog[1].Seq != backlog[0].Seq+1 {
		t.Errorf("backlog seqs not monotonic: %d, %d", backlog[0].Seq, backlog[1].Seq)
	}

	// Resume after the first: only newer deliveries replay, live continues.
	_, cancel2, backlog2 := hub.SubscribeSince([]string{TopicGlobal}, backlog[0].Seq)
	defer cancel2()
	if len(backlog2) != 1 || backlog2[0].Seq != backlog[1].Seq {
		t.Fatalf("resume backlog = %+v, want only seq %d", backlog2, backlog[1].Seq)
	}
}

func TestHubHistoryBoundedPerTopic(t *testing.T) {
	hub := NewHub()
	for i := 0; i < historyCapPerTopic+10; i++ {
		hub.Publish(TopicGlobal, newEvent(i))
	}
	_, cancel, backlog := hub.SubscribeSince([]string{TopicGlobal}, 0)
	defer cancel()
	if len(backlog) != historyCapPerTopic {
		t.Errorf("backlog = %d, want cap %d", len(backlog), historyCapPerTopic)
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
