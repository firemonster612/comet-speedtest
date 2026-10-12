// Shared by the CLI and the generated READMEs. Links are absolute because generated
// projects do not include the Comet repository docs.
const repositoryUrl = "https://github.com/firemonster612/comet-speedtest";

export const endpointContractUrl = `${repositoryUrl}/blob/main/docs/library/config.md#targets`;
export const nginxExampleUrl = `${repositoryUrl}/tree/main/examples/nginx`;

// Paths served by the NGINX example. "Configure later" writes them as placeholders.
export const sameOriginTargets = {
  download: "/speedtest/download/large.bin",
  upload: "/speedtest/upload",
  latency: "/speedtest/latency",
};
