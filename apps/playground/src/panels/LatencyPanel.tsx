import type { RuntimeConfig } from "@lightspeed/config";
import { testSectionFields } from "@lightspeed/config";

import { type ConfigUpdater, Panel, SchemaField, SelectField } from "./shared";

export function LatencyPanel({
  config,
  onUpdate,
}: {
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
}) {
  return (
    <Panel>
      {testSectionFields("latency").map((spec) => (
        <SchemaField key={spec.key} config={config} spec={spec} onUpdate={onUpdate} />
      ))}
      <SelectField
        label="Latency target mode"
        options={[
          { label: "Use download endpoint", value: "download" },
          { label: "Dedicated latency endpoint", value: "dedicated" },
        ]}
        value={config.targets.latency ? "dedicated" : "download"}
        onValueChange={(mode) =>
          onUpdate((draft) => {
            const targets = { ...draft.targets };
            if (mode === "download") {
              delete targets.latency;
            } else {
              targets.latency = draft.targets.latency ?? draft.targets.download;
            }
            return { ...draft, targets };
          })
        }
      />
    </Panel>
  );
}
