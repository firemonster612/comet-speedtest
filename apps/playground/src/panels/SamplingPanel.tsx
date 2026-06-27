import type { RuntimeConfig } from "@lightspeed/config";
import { testSectionFields } from "@lightspeed/config";

import { type ConfigUpdater, Panel, SchemaField, SwitchField } from "./shared";

export function SamplingPanel({
  config,
  onUpdate,
}: {
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
}) {
  return (
    <Panel>
      {testSectionFields("sampling").map((spec) => (
        <SchemaField key={spec.key} config={config} spec={spec} onUpdate={onUpdate} />
      ))}
      <SwitchField
        checked={config.result?.includeRawSamples ?? false}
        label="Include raw samples"
        onCheckedChange={(checked) =>
          onUpdate((draft) => ({
            ...draft,
            result: {
              ...draft.result,
              includeRawSamples: checked,
            },
          }))
        }
      />
    </Panel>
  );
}
