# Local Database Guide

Football Lottery Analysis Lab uses an H2 Embedded File database by default. The
backend starts without a separate database server, runs Flyway migrations on
startup, and stores local runtime data under `apps/server/data/`.

## Default H2 Embedded File Database

Default datasource settings are defined in
`apps/server/src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:
  flyway:
    enabled: true
    locations: classpath:db/migration
  h2:
    console:
      enabled: true
      path: /h2-console
```

When the backend is started with Maven from the repository root:

```shell
mvn -f apps/server/pom.xml spring-boot:run
```

the Spring Boot working directory is `apps/server`, so the H2 files are created
inside:

```text
apps/server/data/
  football_lottery_analysis_lab.mv.db
  football_lottery_analysis_lab.trace.db
  football_lottery_analysis_lab.lock.db
```

The trace and lock files are created only when H2 needs them. Runtime database
files are ignored by Git through `.gitignore`:

```text
apps/server/data/
*.mv.db
*.trace.db
*.lock.db
```

## Flyway Migrations

Flyway migration files live in:

```text
apps/server/src/main/resources/db/migration/
```

The first schema migration is:

```text
V1__init_h2_schema.sql
```

It creates the persisted core tables:

```text
screenshot_task
ocr_task
ocr_confirmed_snapshot
analysis_report
simulated_plan
simulated_plan_item
public_result_snapshot
review_record
```

The H2 connection enables MySQL compatibility mode with `MODE=MySQL` and
`DATABASE_TO_LOWER=TRUE`. New migrations should keep table and column names in
lowercase snake_case and avoid H2-only SQL features whenever practical.

## H2 Console

H2 Console is enabled for local development only.

1. Start the backend:

   ```shell
   mvn -f apps/server/pom.xml spring-boot:run
   ```

2. Open:

   ```text
   http://127.0.0.1:8080/h2-console
   ```

3. Use:

   ```text
   JDBC URL: jdbc:h2:file:./data/football_lottery_analysis_lab;MODE=MySQL;DATABASE_TO_LOWER=TRUE
   User Name: sa
   Password:
   ```

Do not expose H2 Console outside local development. Keep it disabled in any
shared, hosted, or production-like environment.

## Clean Local Data

To reset local persisted data:

1. Stop the backend process.
2. Remove the local database directory:

   ```shell
   Remove-Item -LiteralPath apps/server/data -Recurse -Force
   ```

3. Start the backend again. Flyway will recreate the schema on first startup.

Do not remove H2 files while the backend is running.

## Stage 8 Smoke Repeatability

`npm run smoke:stage8` creates fictional workflow data through the public API.
The persisted H2 database keeps this data between backend restarts. Repository
sequence restoration avoids id collisions across repeated runs, so the smoke
flow can be executed more than once against the same local database.

For a fully clean smoke run, stop the backend and remove `apps/server/data/`
before running:

```shell
npm run verify:stage8
```

## Future MySQL Migration

The current default is H2 file mode. A future MySQL deployment can start from
`apps/server/src/main/resources/application-mysql.example.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/football_lottery_analysis_lab?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: football_lab_user
    password: change-me
  flyway:
    enabled: true
    locations: classpath:db/migration
  h2:
    console:
      enabled: false
```

Migration path:

1. Create the MySQL database, for example `football_lottery_analysis_lab`.
2. Copy `application-mysql.example.yml` to an environment-specific Spring Boot
   config file, such as `application-mysql.yml`.
3. Adjust `spring.datasource.url`, `username`, `password`, and
   `driver-class-name`.
4. Make sure the runtime includes a MySQL JDBC driver such as
   `com.mysql:mysql-connector-j` before enabling the MySQL profile.
5. Review Flyway SQL compatibility, then start the backend with the MySQL
   profile. Flyway will apply the same migration chain.

The MySQL profile should keep H2 Console disabled.

## Compliance Boundary

Persistence does not change the product boundary. The backend stores local
fictional workflow data and Mock provider snapshots only.

- No real lottery purchase, payment, ticket issuing, proxy purchase, group
  purchase, following-order, deposit, or withdrawal capability.
- No official lottery data crawling, caching, mirroring, or republishing.
- Public results remain Mock/PublicResultProvider data in the local experiment
  workflow.
- All analysis, simulated plans, and reviews remain for learning, replay, and
  simulation only.
