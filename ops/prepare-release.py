#!/usr/bin/env python3
"""Resolve a Draft PR to one immutable release plan using the caller's existing gh login."""
import argparse,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('pr',type=int);a=p.parse_args()
repo='gris812/Hey-City'
def api(path): return json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/'+path],text=True))
pr=api(f'pulls/{a.pr}');sha=pr['head']['sha']
assert pr['state']=='open' and pr['head']['repo']['full_name']==repo and re.fullmatch('[a-f0-9]{40}',sha)
runs=api(f'actions/runs?head_sha={sha}&event=pull_request&per_page=100')['workflow_runs']
runs=[r for r in runs if r['path']=='.github/workflows/validation.yml' and r['conclusion']=='success']
assert runs,'No successful validation for this exact source'
run=max(runs,key=lambda r:r['id'])
artifacts=api(f'actions/runs/{run["id"]}/artifacts')['artifacts']
artifact=next((x for x in artifacts if x['name']=='staging-api-'+sha and not x['expired']),None)
assert artifact,'Reviewed image artifact missing/expired: rerun validation; do not substitute a different image'
print(json.dumps({'pr':a.pr,'sourceSha':sha,'ciRunId':run['id'],'artifactId':artifact['id'],'artifactDigest':artifact.get('digest'),'authorization':'Set the protected staging approved SHA and independently verified config digest, then approve the environment deployment'},indent=2))
print(f'gh workflow run staging-deploy.yml --repo {repo} --ref main -f commit_sha={sha} -f artifact_run_id={run["id"]}')
print(f'gh workflow run ios-staging-build.yml --repo {repo} --ref main -f commit_sha={sha}')
