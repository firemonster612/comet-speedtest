// A real upload endpoint for the browser tests. Playwright's Firefox does not
// intercept XHR sent from a Web Worker, so `page.route` can't fake the upload
// target the way it fakes the others. GET /uploads lists the paths posted so far.
import { createServer } from "node:http";

const port = Number(process.env.UPLOAD_FIXTURE_PORT ?? 4175);
const uploadedPaths = [];

createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, HEAD, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && pathname === "/uploads") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(uploadedPaths));
    return;
  }
  request.resume();
  request.on("end", () => {
    if (request.method === "POST") {
      uploadedPaths.push(pathname);
    }
    response.writeHead(204);
    response.end();
  });
}).listen(port, "127.0.0.1");
