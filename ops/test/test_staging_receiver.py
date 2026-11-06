import json, os, pathlib, subprocess, tempfile, unittest
import test_image_identity as fixtures
SHA=fixtures.SHA
ROOT=pathlib.Path(__file__).resolve().parents[1]
STUB=r'''#!/usr/bin/env python3
import json,os,pathlib,shutil,sys
p=pathlib.Path(os.environ['MOCK_STATE']); s=json.loads(p.read_text()); args=sys.argv[1:]; name=pathlib.Path(sys.argv[0]).name
old='sha256:'+'b'*64; new=('sha256:'+'c'*64) if s['differentEngineId'] else s['configDigest']; image='heycity-staging-api:git-'+os.environ['MOCK_SHA']
def write(): p.write_text(json.dumps(s))
if name=='id': print('restricted' if '-nG' in args else '0')
elif name=='free': print('Mem: 1800 500 0 0 0 700')
elif name=='df': print('Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 99999999 1 99999998 1% /')
elif name=='sleep': pass
elif name=='curl':
    staging='4110' in args[-1] or 'staging-api' in args[-1]
    if staging and s['current']=='new' and s['failHealth']: sys.exit(22)
    print(json.dumps({'status':'ok','environment':'staging','buildSha':os.environ['MOCK_SHA'] if s['current']=='new' else 'unknown','capabilities':['core_v2_m3_conversation']}) if staging else '{"status":"ok","service":"production"}')
elif name=='docker':
    if args[0]=='ps': print('abc' if '-q' in args else 'abc\ndef')
    elif args[0]=='load': s['loads']+=1; write()
    elif args[0]=='save': shutil.copyfile(os.environ['MOCK_ARCHIVE'],args[args.index('-o')+1])
    elif args[0]=='version': print('"fixture-engine"')
    elif args[0]=='info': print('[["driver-type","fixture-store"]]')
    elif args[:2]==['image','inspect']:
        ref=args[-1]; field=args[args.index('--format')+1]
        print((old if ref==old else new) if field=='{{.Id}}' else ('a'*40 if ref==image else 'b'*40))
    elif args[0]=='tag':
        assert args[1]==old, 'Rollback must capture the actual running image, not its mutable tag'
        s['rollbackTag']=args[-1]; write()
    elif args[0]=='inspect':
        field=args[args.index('--format')+1]
        print({'{{.Config.Image}}':image if s['current']=='new' else 'old-image','{{.Image}}':new if s['current']=='new' else old,'{{.RestartCount}}':'0','{{.State.Running}}:{{.RestartCount}}':'true:0','{{index .Config.Labels "org.opencontainers.image.revision"}}':'b'*40,'{{.State.Health.Status}}':'healthy'}[field])
    elif args[0]=='compose':
        if 'up' in args:
            assert '--no-deps' in args and args[-1]=='api'
            s['current']='new' if os.environ['STAGING_API_IMAGE']==image else 'old'
            s['ups'].append(s['current']);write()
    else: sys.exit(99)
'''
class ReceiverTests(unittest.TestCase):
    def run_receiver(self, fail=False, mode='deploy', corrupt_loaded=False, different_engine_id=False, bad_input=False):
        with tempfile.TemporaryDirectory() as d:
            d=pathlib.Path(d); base=d/'staging';base.mkdir();(base/'docker-compose.staging.yml').write_text('fixture')
            env=base/'.env.staging';env.write_text('fixture');env.chmod(0o600)
            approved=d/'approved.tar';loaded=d/'loaded.tar';fixtures.IdentityTests().archive(approved);fixtures.IdentityTests().archive(loaded,corrupt=corrupt_loaded)
            from image_identity import inspect
            state=d/'state.json';state.write_text(json.dumps({'configDigest':inspect(approved,SHA)['configDigest'],'current':'old','loads':0,'ups':[],'failHealth':fail,'differentEngineId':different_engine_id}))
            if bad_input: approved.write_bytes(b'malformed')
            bindir=d/'bin';bindir.mkdir(); stub=bindir/'stub';stub.write_text(STUB);stub.chmod(0o755)
            for cmd in ['docker','curl','free','df','id','sleep']: (bindir/cmd).symlink_to(stub)
            script=(ROOT/'heycity-staging-deploy').read_text().replace('/opt/HeyCity-staging',str(base)).replace('/run/lock/heycity-staging-deploy.lock',str(d/'lock')).replace('/usr/local/lib/heycity/image_identity.py',str(ROOT/'image_identity.py')).replace('/tmp/heycity-',str(d/'heycity-'))
            receiver=d/'receiver';receiver.write_text(script)
            with approved.open('rb') as stdin:
                r=subprocess.run(['bash',str(receiver),SHA,mode],stdin=stdin,text=True,capture_output=True,timeout=30,env={**os.environ,'PATH':str(bindir)+':'+os.environ['PATH'],'MOCK_STATE':str(state),'MOCK_ARCHIVE':str(loaded),'MOCK_SHA':SHA})
            result=json.loads(state.read_text()); self.assertEqual(list(d.glob('heycity-*')), [], 'Temporary image/proof leaked')
            return r,result
    def test_deploy_verified_image_only(self):
        r,s=self.run_receiver();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(s['ups'],['new']);self.assertEqual(s['current'],'new')
    def test_unhealthy_new_image_restores_previous(self):
        r,s=self.run_receiver(fail=True);self.assertNotEqual(r.returncode,0);self.assertEqual(s['ups'],['new','old']);self.assertEqual(s['current'],'old');self.assertIn('rollback_health_verified=1',r.stderr)
    def test_mismatch_never_updates_service(self):
        r,s=self.run_receiver(corrupt_loaded=True);self.assertNotEqual(r.returncode,0);self.assertEqual(s['ups'],[])
    def test_diagnose_neither_loads_nor_deploys(self):
        r,s=self.run_receiver(mode='diagnose');self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(s['loads'],0);self.assertEqual(s['ups'],[])
    def test_different_engine_id_requires_identical_exported_content(self):
        r,s=self.run_receiver(different_engine_id=True);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(s['ups'],['new'])
    def test_malformed_input_never_loads_and_cleans_up(self):
        r,s=self.run_receiver(bad_input=True);self.assertNotEqual(r.returncode,0);self.assertEqual(s['loads'],0);self.assertEqual(s['ups'],[])
if __name__=='__main__': unittest.main()
