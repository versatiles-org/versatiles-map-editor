# Must match the installed playwright version, otherwise the prebuilt browsers are missing.
# scripts/test_playwright_docker.sh passes the version of the locally installed playwright.
ARG PLAYWRIGHT_VERSION=1.63.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
WORKDIR /code
COPY docker/xvfb-startup.sh /usr/local/bin/xvfb-startup.sh
RUN chmod +x /usr/local/bin/xvfb-startup.sh
COPY package.json package-lock.json ./
RUN npm ci
COPY *.ts *.js *.json ./
ENTRYPOINT ["/usr/local/bin/xvfb-startup.sh"]
