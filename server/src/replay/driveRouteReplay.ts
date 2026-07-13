import type { StoryFinishReason } from '@heycity/shared';
import fs from 'node:fs';
import path from 'node:path';
import {
  createSession,
  DriveSessionParams,
  finishActiveStory,
  pingSession,
  PingResult,
} from '../services/driveSession';

export interface DriveReplayFixture {
  name: string;
  userId?: string;
  session: DriveSessionParams;
  events: DriveReplayEvent[];
}

export type DriveReplayEvent =
  | {
      type: 'ping';
      atMs: number;
      lat: number;
      lng: number;
      heading: number;
      speedKmh: number;
    }
  | {
      type: 'finish_story';
      atMs: number;
      reason: StoryFinishReason;
    };

export type DriveReplayStep =
  | {
      type: 'ping';
      atMs: number;
      nextAction: PingResult['nextAction'];
      poiId?: string;
      decisionType?: string;
      holdReason?: string;
      triggerReason?: string;
      estimatedDurationSec?: number;
    }
  | {
      type: 'finish_story';
      atMs: number;
      reason: StoryFinishReason;
      activeStoryWasPlaying: boolean;
    };

export interface DriveReplayResult {
  fixtureName: string;
  sessionId: string;
  steps: DriveReplayStep[];
  summary: {
    triggerCount: number;
    triggeredPoiIds: string[];
    finishCount: number;
    holdReasons: string[];
  };
}

export function loadDriveReplayFixture(filePath: string): DriveReplayFixture {
  const resolved = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as DriveReplayFixture;
}

export async function runDriveRouteReplay(
  fixture: DriveReplayFixture
): Promise<DriveReplayResult> {
  const session = createSession(fixture.userId ?? 'route_replay_user', fixture.session);
  const steps: DriveReplayStep[] = [];

  for (const event of fixture.events) {
    if (event.type === 'finish_story') {
      const result = finishActiveStory(session.id, event.reason);
      steps.push({
        type: 'finish_story',
        atMs: event.atMs,
        reason: event.reason,
        activeStoryWasPlaying: result?.activeStoryWasPlaying ?? false,
      });
      continue;
    }

    const result = await pingSession(
      session.id,
      event.lat,
      event.lng,
      event.heading,
      event.speedKmh,
      event.atMs
    );
    steps.push(toPingStep(event.atMs, result));
  }

  const triggerSteps = steps.filter(
    (step): step is Extract<DriveReplayStep, { type: 'ping' }> =>
      step.type === 'ping' && step.decisionType === 'trigger_story'
  );
  const finishSteps = steps.filter((step) => step.type === 'finish_story');
  const holdReasons = steps
    .filter(
      (step): step is Extract<DriveReplayStep, { type: 'ping' }> =>
        step.type === 'ping' && Boolean(step.holdReason)
    )
    .map((step) => step.holdReason as string);

  return {
    fixtureName: fixture.name,
    sessionId: session.id,
    steps,
    summary: {
      triggerCount: triggerSteps.length,
      triggeredPoiIds: triggerSteps.flatMap((step) => (step.poiId ? [step.poiId] : [])),
      finishCount: finishSteps.length,
      holdReasons,
    },
  };
}

export function formatDriveReplayResult(result: DriveReplayResult): string {
  const lines = [
    `Replay: ${result.fixtureName}`,
    `Session: ${result.sessionId}`,
    ...result.steps.map(formatStep),
    `Summary: triggers=${result.summary.triggerCount} finishes=${result.summary.finishCount} pois=${result.summary.triggeredPoiIds.join(',')}`,
    `Holds: ${result.summary.holdReasons.join(',') || 'none'}`,
  ];
  return lines.join('\n');
}

function toPingStep(atMs: number, result: PingResult): DriveReplayStep {
  return {
    type: 'ping',
    atMs,
    nextAction: result.nextAction,
    poiId: result.poi?.place_id,
    decisionType: result.decision?.type,
    holdReason: result.decision?.type === 'hold' ? result.decision.reason : undefined,
    triggerReason:
      result.decision?.type === 'trigger_story' ? result.decision.triggerReason : undefined,
    estimatedDurationSec: result.estimatedDurationSec,
  };
}

function formatStep(step: DriveReplayStep): string {
  const at = `${step.atMs}ms`.padStart(8, ' ');
  if (step.type === 'finish_story') {
    return `${at} finish_story reason=${step.reason} active=${step.activeStoryWasPlaying}`;
  }
  if (step.decisionType === 'trigger_story') {
    return `${at} ping PLAY poi=${step.poiId} trigger=${step.triggerReason} duration=${step.estimatedDurationSec}`;
  }
  return `${at} ping ${step.nextAction} hold=${step.holdReason ?? 'none'}`;
}
