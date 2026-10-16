import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import {
  benchmarkMarkdown,
  type M4BenchmarkEnvironment,
  type M4NativeBenchmarkArtifact,
} from './realtimeVoiceBenchmark';

export async function createNativeBenchmarkEnvironment(): Promise<M4BenchmarkEnvironment> {
  const network = await Network.getNetworkStateAsync().catch(() => undefined);
  return {
    mode: 'live_native',
    device: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'unknown_iPhone',
    os: `${Platform.OS} ${Device.osVersion ?? Platform.Version}`,
    appBuild: `${Application.nativeApplicationVersion ?? 'unknown'} (${Application.nativeBuildVersion ?? 'unknown'})`,
    gitSha: String(Constants.expoConfig?.extra?.buildGitSha || process.env.EXPO_PUBLIC_GIT_SHA || 'local_unstamped_build'),
    network: network ? `${network.type}:${network.isInternetReachable === false ? 'offline' : 'online'}` : 'unknown',
    fixture: 'm4-road-noise-v1-generated',
  };
}

export async function saveNativeBenchmarkArtifact(
  artifact: M4NativeBenchmarkArtifact,
): Promise<{ jsonUri: string; markdownUri: string }> {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('benchmark_document_directory_unavailable');
  const directory = `${base}m4-live/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const jsonUri = `${directory}${artifact.runId}.json`;
  const markdownUri = `${directory}${artifact.runId}.md`;
  await FileSystem.writeAsStringAsync(jsonUri, JSON.stringify(artifact, null, 2));
  await FileSystem.writeAsStringAsync(markdownUri, benchmarkMarkdown(artifact));
  return { jsonUri, markdownUri };
}

export async function shareNativeBenchmarkArtifact(uri: string): Promise<boolean> {
  if (!await Sharing.isAvailableAsync()) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export M4 native benchmark' });
  return true;
}
