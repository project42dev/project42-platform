FROM postgres:17.10-alpine3.24

# The upstream image currently bundles gosu built with a Go standard library
# affected by CVE-2025-68121. Project 42 runs the database as the image's
# existing postgres user, so the privilege-drop helper is unnecessary.
RUN rm -f /usr/local/bin/gosu

USER postgres
