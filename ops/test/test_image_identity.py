import hashlib, io, json, pathlib, sys, tarfile, tempfile, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from image_identity import inspect
SHA = 'a' * 40
class IdentityTests(unittest.TestCase):
    def archive(self, path, corrupt=False, extra=False, revision=SHA, architecture='amd64'):
        layer = b'reviewed filesystem bytes'
        config = {'os':'linux','architecture':architecture,'config':{'Labels':{'org.opencontainers.image.revision':revision}},'rootfs':{'diff_ids':['sha256:'+hashlib.sha256(layer).hexdigest()]},'history':[{'created_by':'fixture'}]}
        raw=json.dumps(config).encode(); name=hashlib.sha256(raw).hexdigest()+'.json'
        files={name:raw,'layer.tar': layer if not corrupt else b'changed', 'manifest.json':json.dumps([{'Config':name,'RepoTags':['heycity-staging-api:git-'+SHA],'Layers':['layer.tar']}]).encode()}
        if extra: files['index.json']=b'{"manifests":[],"schemaVersion":2}'
        with tarfile.open(path,'w') as tar:
            for key,value in files.items():
                m=tarfile.TarInfo(key);m.size=len(value);tar.addfile(m,io.BytesIO(value))
    def test_store_metadata_does_not_change_config_identity(self):
        with tempfile.TemporaryDirectory() as d:
            a=pathlib.Path(d)/'a.tar'; b=pathlib.Path(d)/'b.tar'
            self.archive(a); self.archive(b,extra=True)
            self.assertEqual(inspect(a,SHA)['configDigest'],inspect(b,SHA)['configDigest'])
            self.assertEqual(inspect(a,SHA)['diffIds'],inspect(b,SHA)['diffIds'])
    def test_changed_layer_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'x.tar';self.archive(p,corrupt=True)
            with self.assertRaisesRegex(ValueError,'content mismatch'): inspect(p,SHA)
    def test_wrong_source_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'x.tar';self.archive(p)
            with self.assertRaises(ValueError): inspect(p,'b'*40)
    def test_revision_label_and_platform_rejected(self):
        for options in [{'revision':'b'*40}, {'architecture':'arm64'}]:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as d:
                p=pathlib.Path(d)/'x.tar'; self.archive(p,**options)
                with self.assertRaises(ValueError): inspect(p,SHA)
    def test_malformed_archive_rejected_without_echoing_input(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'x.tar'; p.write_bytes(b'private-untrusted-archive-data')
            r=subprocess.run([sys.executable,str(pathlib.Path(__file__).resolve().parents[1]/'image_identity.py'),str(p),'--sha',SHA],capture_output=True,text=True)
            self.assertEqual(r.returncode,78); self.assertNotIn('private-untrusted',r.stderr)
    def test_duplicate_and_unsafe_paths_rejected(self):
        for name in ['manifest.json','../unsafe','/unsafe']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as d:
                p=pathlib.Path(d)/'x.tar'; self.archive(p)
                with tarfile.open(p,'a') as tar:
                    m=tarfile.TarInfo(name); m.size=2;tar.addfile(m,io.BytesIO(b'{}'))
                with self.assertRaises(ValueError): inspect(p,SHA)
if __name__=='__main__': unittest.main()
