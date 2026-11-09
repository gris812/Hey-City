import json, os, pathlib, subprocess, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SHA='a'*40

class PlanTests(unittest.TestCase):
    def run_plan(self, failed=False, diverged=False):
        with tempfile.TemporaryDirectory() as d:
            d=pathlib.Path(d)
            gh=d/'gh'; gh.write_text('''#!/usr/bin/env python3
import json,os,sys
p=sys.argv[-1]; sha='a'*40
if '/pulls/' in p: value={'state':'open','head':{'sha':sha,'repo':{'full_name':'gris812/Hey-City'}},'base':{'sha':'b'*40,'ref':'base-branch'}}
elif '/compare/' in p: value={'status':'diverged' if os.environ['DIVERGED']=='1' else 'ahead'}
else:
    run={'id':10,'path':'.github/workflows/validation.yml','head_sha':sha,'status':'completed','conclusion':'success'}
    value={'workflow_runs':[run]}
    if os.environ['FAILED']=='1': value['workflow_runs'].append({**run,'id':11,'conclusion':'failure'})
print(json.dumps(value))
''');gh.chmod(0o755)
            return subprocess.run([sys.executable,str(ROOT/'prepare-release.py'),'31'],capture_output=True,text=True,
                                  env={**os.environ,'PATH':str(d)+':'+os.environ['PATH'],'FAILED':str(int(failed)),'DIVERGED':str(int(diverged))})
    def test_exact_source_plan_needs_no_stored_image(self):
        r=self.run_plan(); self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn(SHA,r.stdout);self.assertIn('ios-preview.yml',r.stdout);self.assertNotIn('artifact_run_id',r.stdout)
    def test_latest_failed_validation_overrides_older_success(self):
        r=self.run_plan(failed=True);self.assertNotEqual(r.returncode,0);self.assertNotIn('gh workflow run',r.stdout)
    def test_missing_base_dependency_refuses_release(self):
        r=self.run_plan(diverged=True);self.assertNotEqual(r.returncode,0);self.assertNotIn('gh workflow run',r.stdout)

if __name__=='__main__':unittest.main()
