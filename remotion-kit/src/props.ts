// Props types derive from the GENERATED proto TS types (S0-04/S3-06) —
// recreating these schemas by hand in TS is forbidden.
import type { StudioScript } from "./gen/app/studio/v1/script_pb";

export interface StudioVideoProps {
  /** Display title for the placeholder scene. */
  title: string;
  /** Total intended duration; compositions derive their length from it. */
  durationMs: number;
  /** The single source of truth script (protojson-compatible object). */
  script: StudioScript;
}
