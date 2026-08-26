// Generates schema/scene-props.schema.json from the Zod scene grammar.
// Consumed by the Go artifact observer (S4-07) — same pattern as the S1-02
// studio script JSON Schema.
import fs from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";

import { sceneSchema } from "../src/scenes/schema.js";

const jsonSchema = zodToJsonSchema(sceneSchema, {
  name: "StudioScene",
  target: "draft-2020-12",
});

// zod-to-json-schema emits draft-07 boolean exclusiveMinimum; migrate to the
// numeric form required by draft-2020-12 consumers (Ajv, Go santhosh-tekuri).
function migrateExclusiveMinimum(node) {
  if (Array.isArray(node)) {
    node.forEach(migrateExclusiveMinimum);
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  if (typeof node.exclusiveMinimum === "boolean") {
    if (node.exclusiveMinimum && typeof node.minimum === "number") {
      node.exclusiveMinimum = node.minimum;
      delete node.minimum;
    } else {
      delete node.exclusiveMinimum;
    }
  }
  for (const value of Object.values(node)) {
    migrateExclusiveMinimum(value);
  }
}
migrateExclusiveMinimum(jsonSchema);

fs.mkdirSync(new URL("../schema/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../schema/scene-props.schema.json", import.meta.url),
  JSON.stringify(jsonSchema, null, 2) + "\n"
);
console.log("wrote schema/scene-props.schema.json");
