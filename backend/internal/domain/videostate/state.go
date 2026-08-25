// Package videostate is the executable truth of the canonical video state
// machine (ROADMAP.md). Every status change in the system MUST go through
// this package — never inline (T-08).
package videostate

// State is a pipeline status stored as text in the videos table.
type State string

const (
	StateNew            State = "new"
	StateScriptPending  State = "script_pending"
	StateScriptReview   State = "script_review"
	StateScriptApproved State = "script_approved"
	StateRecording      State = "recording"
	StateVoiceProcess   State = "voice_processing"
	StateScenesPending  State = "scenes_pending"
	StateScenesReview   State = "scenes_review"
	StateQueued         State = "queued"
	StateRendering      State = "rendering"
	StateFinalReview    State = "final_review"
	StateReleased       State = "released"
	StateBlocked        State = "blocked"
)
