# Comet Nginx Example

This directory contains reference snippets for hosting the static production app
and the byte-serving endpoints.

## Files

- `nginx.conf`: same-origin static app plus speed test endpoints.
- `cors.conf`: CORS headers for cross-origin endpoint hosting.
- `upload-discard.conf`: upload endpoint settings for accepting and discarding
  test bodies with Nginx request-body discard behavior.

## Production Asset Layout

```text
/usr/share/nginx/html/
  index.html
  assets/
  comet.config.json
  brand/
  speedtest/
    download/
      large.bin
```

Create the download file before running a real test:

```sh
truncate --size 10G /usr/share/nginx/html/speedtest/download/large.bin
```

Install the snippets at the paths referenced by `nginx.conf`:

```sh
install -D -m 0644 upload-discard.conf /etc/nginx/snippets/comet-upload-discard.conf
install -D -m 0644 cors.conf /etc/nginx/snippets/comet-cors.conf
```

For cross-origin endpoint hosting, include `cors.conf` inside the speed test
locations and set the allowed origin to the production app origin.

## Upload Discard

The upload endpoint must read the full request body before returning a success
response. The public upload location streams the body to the loopback discard
server in `nginx.conf` with `proxy_request_buffering off`, avoiding a custom
application backend and avoiding forced temp-file writes. If your deployment
requires full request buffering before the upstream response, turn buffering on
and size `client_body_buffer_size` for the expected upload chunks.
