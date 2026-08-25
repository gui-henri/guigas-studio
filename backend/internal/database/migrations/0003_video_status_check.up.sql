ALTER TABLE videos ADD CONSTRAINT videos_status_valid CHECK (
    status IN (
        'new', 'script_pending', 'script_review', 'script_approved',
        'recording', 'voice_processing', 'scenes_pending', 'scenes_review',
        'queued', 'rendering', 'final_review', 'released', 'blocked'
    )
);
