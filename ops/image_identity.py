#!/usr/bin/env python3
"""Verify docker-save bytes, not engine-specific display IDs. Never extract or print config/env."""
import argparse, gzip, hashlib, json, re, tarfile, sys

def digest(stream):
    h = hashlib.sha256()
    while chunk := stream.read(1024 * 1024): h.update(chunk)
    return 'sha256:' + h.hexdigest()

def inspect(path, sha):
    if not re.fullmatch('[a-f0-9]{40}', sha): raise ValueError('Invalid source SHA')
    with tarfile.open(path, 'r:*') as tar:
        members = tar.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)): raise ValueError('Duplicate archive paths')
        if any(n.startswith('/') or '..' in n.split('/') for n in names): raise ValueError('Unsafe archive paths')
        def read(name):
            member = tar.getmember(name)
            if not member.isfile(): raise ValueError('Nonregular image member')
            return tar.extractfile(member)
        manifest = json.load(read('manifest.json'))
        tag = 'heycity-staging-api:git-' + sha
        if len(manifest) != 1 or manifest[0].get('RepoTags') != [tag]: raise ValueError('Unexpected image/tag')
        item = manifest[0]
        config_bytes = read(item['Config']).read(1024 * 1024 + 1)
        if len(config_bytes) > 1024 * 1024: raise ValueError('Oversized config')
        config_digest = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
        advertised = item['Config'].split('/')[-1].removesuffix('.json')
        if advertised != config_digest.removeprefix('sha256:'): raise ValueError('Config filename digest mismatch')
        config = json.loads(config_bytes)
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64': raise ValueError('Unexpected platform')
        if config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != sha: raise ValueError('Revision mismatch')
        expected = config.get('rootfs', {}).get('diff_ids', [])
        if not expected or len(expected) != len(item['Layers']): raise ValueError('Layer count mismatch')
        actual = []
        for name in item['Layers']:
            stream = read(name)
            magic = stream.read(2)
            stream.close()
            stream = read(name)
            actual.append(digest(gzip.GzipFile(fileobj=stream) if magic == b'\x1f\x8b' else stream))
            stream.close()
        if actual != expected: raise ValueError('Root filesystem content mismatch')
        identifiers = []
        for member in members:
            if member.isfile() and member.size < 1024 * 1024 and (member.name.endswith('.json') or member.name.startswith('blobs/sha256/')):
                try:
                    raw = read(member.name).read()
                    obj = json.loads(raw)
                    if isinstance(obj, dict) and ('manifests' in obj or 'layers' in obj and 'config' in obj):
                        identifiers.append({'digest': 'sha256:' + hashlib.sha256(raw).hexdigest(), 'kind': 'index' if 'manifests' in obj else 'manifest'})
                except (ValueError, UnicodeDecodeError): pass
        return {'sourceSha': sha, 'configDigest': config_digest, 'diffIds': actual, 'platform': 'linux/amd64', 'descriptors': identifiers}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('archive'); p.add_argument('--sha', required=True)
    p.add_argument('--config-digest'); p.add_argument('--compare')
    a = p.parse_args()
    result = inspect(a.archive, a.sha)
    if a.config_digest and result['configDigest'] != a.config_digest: raise ValueError('Approved config digest mismatch')
    if a.compare:
        other = inspect(a.compare, a.sha)
        if result['configDigest'] != other['configDigest'] or result['diffIds'] != other['diffIds']: raise ValueError('Loaded image differs from approved config/filesystem')
        result['equivalent'] = True
        result['loadedDescriptors'] = other['descriptors']
    print(json.dumps(result, sort_keys=True))
if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, TypeError, AttributeError, OSError, EOFError, tarfile.TarError):
        # Do not echo untrusted archive paths, configuration, history or environment.
        print('Image identity validation failed; no deployment permitted', file=sys.stderr)
        sys.exit(78)
