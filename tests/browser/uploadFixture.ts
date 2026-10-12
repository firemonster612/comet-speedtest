/** Origin of `upload-fixture-server.mjs`, started by playwright.config.ts. */
export const uploadFixtureOrigin = "http://127.0.0.1:4175";

/** Paths the upload fixture server has received POSTs on, across all tests. */
export async function uploadedPaths(): Promise<string[]> {
  const response = await fetch(`${uploadFixtureOrigin}/uploads`);
  return (await response.json()) as string[];
}
