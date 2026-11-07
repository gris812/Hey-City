#!/usr/bin/env python3
"""Resolve a Draft PR to one immutable release plan using the caller's existing gh login."""
import argparse,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('pr',type=int);a=p.parse_args()
repo='gris812/Hey-City'
def api(path): return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+path],text=True))
pr=api(f'pulls/{a.pr}');sha=pr['head']['sha']
assert pr['state']=='open' and pr['head']['repo']['full_name']==repo and re.fullmatch('[a-f0-9]{40}',sha)
runs=api(f'actions/runs?head_sha={sha}&event=pull_request&per_page=100')['workflow_runs']
runs=[r for r in runs if r['path']=='.github/workflows/validation.yml' and r['head_sha']==sha]
assert runs,'No validation for this exact source'
run=max(runs,key=lambda r:r['id'])
assert run['status']=='completed' and run['conclusion']=='success','Latest exact-source validation is not successful'
base=pr['base']['sha']
comparison=api(f'compare/{base}...{sha}')
assert comparison['status'] in ['ahead','identical'],'PR base dependency is not included in this head'
print(json.dumps({'pr':a.pr,'sourceSha':sha,'ciRunId':run['id'],'baseBranch':pr['base']['ref'],'baseSha':base,
                  'imagePolicy':'Fresh linux/amd64 build from approved source on GitHub runner; same bytes verified before/after transfer',
                  'authorization':'Set protected staging/ios-preview approved SHA and release tooling SHA; approve the corresponding Environment'},indent=2))
print(f'gh workflow run staging-deploy.yml --repo {repo} --ref main -f commit_sha={sha}')
print('Wait for verified staging receipt/HTTPS success before the iOS dispatch:')
print(f'gh workflow run ios-preview.yml --repo {repo} --ref main -f commit_sha={sha}')
