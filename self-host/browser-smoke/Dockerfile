FROM mcr.microsoft.com/playwright:v1.55.1-noble

USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends libnss3-tools \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /smoke
COPY self-host/browser-smoke/package.json self-host/browser-smoke/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY self-host/browser-smoke/trust-and-run.sh ./trust-and-run.sh
COPY scripts/smoke-secure-browser-session.mjs ./smoke-secure-browser-session.mjs
RUN chmod 0555 ./trust-and-run.sh ./smoke-secure-browser-session.mjs \
  && test "$(id -u pwuser)" = "1001" \
  && test "$(id -g pwuser)" = "1001" \
  && mkdir -p /home/pwuser \
  && chown -R pwuser:pwuser /smoke /home/pwuser

USER pwuser
ENV HOME=/home/pwuser
ENTRYPOINT ["/smoke/trust-and-run.sh"]
