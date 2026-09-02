FROM node:20-bookworm-slim AS web-build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ocr-core/package.json ./packages/ocr-core/package.json
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build:web

FROM maven:3.9.9-eclipse-temurin-17 AS server-build

WORKDIR /workspace

COPY apps/server ./apps/server
COPY --from=web-build /workspace/apps/web/dist ./apps/server/src/main/resources/static
RUN mvn -f apps/server/pom.xml -DskipTests package

FROM eclipse-temurin:17-jre-jammy AS runtime

ENV TRIAL_DATA_DIR=/tmp/football-lottery-analysis-lab \
    JAVA_TOOL_OPTIONS="-XX:InitialRAMPercentage=20 -XX:MaxRAMPercentage=70 -Djava.io.tmpdir=/tmp"

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app "${TRIAL_DATA_DIR}" \
    && chown -R app:app /app "${TRIAL_DATA_DIR}"

WORKDIR /app

COPY --from=server-build --chown=app:app \
    /workspace/apps/server/target/football-lottery-analysis-server-0.2.0.jar \
    /app/app.jar

USER app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar", "--spring.profiles.active=trial"]
