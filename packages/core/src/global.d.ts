export {};

declare global {
  var process:
    | {
        env?: Record<string, string | undefined>;
      }
    | undefined;
}
