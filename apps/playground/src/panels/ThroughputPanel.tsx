import type { RuntimeConfig } from "@lightspeed/config";
import { testSectionFields } from "@lightspeed/config";

import { type ConfigUpdater, Panel, SchemaField } from "./shared";

export function ThroughputPanel({
  config,
  onUpdate,
}: {
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
}) {
  return (
    <Panel>
      {[...testSectionFields("download"), ...testSectionFields("upload")].map(
        (spec) => (
          <SchemaField
            key={`${spec.section}.${spec.key}`}
            config={config}
            spec={spec}
            onUpdate={onUpdate}
          />
        ),
      )}
    </Panel>
  );
}
