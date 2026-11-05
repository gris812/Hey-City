import hashlib, io, json, pathlib, sys, tarfile, tempfile, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from image_identity import inspect
SHA = 'a' * 40
class IdentityTests(unittest.TestCase):
    def archive(self, path, corrupt=False, extra=False):
        layer = b'reviewed filesystem bytes'
        config = {'os':'linux','architecture':'amd64','config':{'Labels':{'org.opencontainers.image.revision':SHA}},'rootfs':{'diff_ids':['sha256:'+hashlib.sha256(layer).hexdigest()]},'history':[{'created_by':'fixture'}]}
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
if __name__=='__main__': unittest.main()
