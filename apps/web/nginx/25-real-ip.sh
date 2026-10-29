#!/bin/sh
# Runs from the nginx image's entrypoint. TRUSTED_PROXIES lists the addresses or CIDRs (comma- or
# space-separated) of a TLS load balancer in front: nginx then takes the client from its
# X-Forwarded-For. Empty: the client is whoever connected.
set -eu

out=/etc/nginx/conf.d/real-ip.conf
: > "$out"
[ -n "${TRUSTED_PROXIES:-}" ] || exit 0
for proxy in $(printf '%s' "$TRUSTED_PROXIES" | tr ',' ' '); do
  printf 'set_real_ip_from %s;\n' "$proxy" >> "$out"
done
printf 'real_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n' >> "$out"
