import { randomUUID } from 'node:crypto';

export function createStage8DataSourceUrl(environment = process.env, uuidFactory = randomUUID) {
  const override = environment.STAGE8_DATASOURCE_URL;
  if (typeof override === 'string' && override.length > 0) {
    return override;
  }

  const databaseId = uuidFactory().replaceAll('-', '');
  return `jdbc:h2:mem:stage8_${databaseId};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1`;
}

export function createStage8SpawnOptions({
  name,
  rootDir,
  platform = process.platform,
  baseEnv = process.env,
  dataSourceUrl
}) {
  return {
    cwd: rootDir,
    detached: platform !== 'win32',
    env: name === 'server'
      ? { ...baseEnv, SPRING_DATASOURCE_URL: dataSourceUrl }
      : baseEnv,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  };
}
