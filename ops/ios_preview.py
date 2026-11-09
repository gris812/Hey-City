#!/usr/bin/env python3
"""Public release metadata only; Expo retains signing and remote version ownership."""
import argparse, json, re, sys
from pathlib import Path
from urllib.parse import urlsplit

API = 'https://staging-api.heycity.stolbergco.com'

def configure(data, sha):
    profile = data['build']['preview']
    if profile.get('distribution') != 'internal' or profile.get('developmentClient') is not False:
        raise ValueError('Standalone internal preview required')
    if profile.get('environment') != 'preview' or profile.get('ios', {}).get('simulator') is not False:
        raise ValueError('Physical preview environment required')
    data.setdefault('cli', {})['appVersionSource'] = 'remote'
    # SDK 54's automatic image is Xcode 26.0; the locked audio module uses 26.2 SDK symbols.
    profile['ios'].update(autoIncrement=True, buildConfiguration='Release', credentialsSource='remote',
                          image='macos-sequoia-15.6-xcode-26.2')
    profile.setdefault('env', {}).update(EXPO_PUBLIC_GIT_SHA=sha, EXPO_PUBLIC_API_URL=API,
                                       EXPO_PUBLIC_M4_NATIVE_BENCHMARK_ENABLED='false')
    # A previous local field-build override must not compete with EAS remote numbering.
    profile['env'].pop('HEY_CITY_FIELD_BUILD_NUMBER', None)
    return data

def report(data, sha):
    builds = data if isinstance(data, list) else [data]
    if len(builds) != 1: raise ValueError('Exactly one iOS build required')
    b = builds[0]
    if b.get('status') != 'FINISHED' or b.get('gitCommitHash') != sha or b.get('platform') != 'IOS':
        raise ValueError('Build is unfinished or source/platform differs')
    if not re.fullmatch(r'[a-f0-9-]{36}', b.get('id', '')): raise ValueError('Invalid build ID')
    version = b.get('appBuildVersion', '')
    if not re.fullmatch(r'\d+(\.\d+){0,2}', version): raise ValueError('Missing native build number')
    links = [b.get('buildDetailsPageUrl', ''), b.get('artifacts', {}).get('buildUrl', '')]
    safe_links = []
    for link in links:
        u = urlsplit(link)
        if u.scheme == 'https' and u.hostname and not u.username and not u.password and not u.query and not u.fragment:
            safe_links.append(link)
    if not safe_links: raise ValueError('No public build/install link returned; inspect EAS dashboard')
    return '\n'.join(['Source: '+sha, 'EAS build: '+b['id'], 'iOS build number: '+version,
                      *('Build/install: '+u for u in safe_links),
                      'Physical installation and iPhone field acceptance are not verified by CI.'])

def main():
    p = argparse.ArgumentParser(); p.add_argument('operation', choices=['configure', 'report'])
    p.add_argument('path'); p.add_argument('--sha', required=True); a = p.parse_args()
    if not re.fullmatch('[a-f0-9]{40}', a.sha): raise ValueError('Full source SHA required')
    path = Path(a.path); data = json.loads(path.read_text())
    if a.operation == 'configure': path.write_text(json.dumps(configure(data, a.sha), indent=2)+'\n')
    else: print(report(data, a.sha))

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, TypeError, OSError):
        print('iOS preview validation failed; inspect authorized EAS build metadata', file=sys.stderr)
        sys.exit(1)
