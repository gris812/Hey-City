import json, os, pathlib, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SHA='a'*40; DIGEST='sha256:'+'b'*64
class SSHTests(unittest.TestCase):
    def invoke(self, command):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'sudo';p.write_text('#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n');p.chmod(0o755)
            return subprocess.run(['bash',str(ROOT/'heycity-staging-ssh')],capture_output=True,text=True,env={**os.environ,'PATH':d+':'+os.environ['PATH'],'SSH_ORIGINAL_COMMAND':command})
    def test_fixed_inspect_arguments_only(self):
        r=self.invoke('inspect '+SHA+' '+DIGEST);self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(json.loads(r.stdout),['-n','/usr/local/sbin/heycity-staging-deploy',SHA,'inspect',DIGEST])
    def test_shell_and_noncanonical_arguments_denied(self):
        for command in ['', 'bash', 'deploy '+SHA+'; id', 'inspect '+SHA+' '+DIGEST+'; id', 'inspect '+SHA+' wrong', 'inspect '+SHA.upper()+' '+DIGEST]:
            with self.subTest(command=command): self.assertNotEqual(self.invoke(command).returncode,0)
if __name__=='__main__':unittest.main()
