import {
  formatDriveReplayResult,
  loadDriveReplayFixture,
  runDriveRouteReplay,
} from '../replay/driveRouteReplay';

async function main(): Promise<void> {
  const fixturePath =
    process.argv[2] ?? '../data/routes/federal-hall-drive-replay.json';
  const fixture = loadDriveReplayFixture(fixturePath);
  const result = await runDriveRouteReplay(fixture);
  console.log(formatDriveReplayResult(result));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
