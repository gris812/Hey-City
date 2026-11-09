import copy, json, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ios_preview import configure, report, API
SHA='a'*40

class PreviewTests(unittest.TestCase):
    def profile(self):
        return {'build':{'preview':{'distribution':'internal','developmentClient':False,'environment':'preview','ios':{'simulator':False}},'production':{'env':{'unchanged':'yes'}}}}
    def build(self):
        return {'id':'12345678-1234-1234-1234-123456789abc','status':'FINISHED','gitCommitHash':SHA,'platform':'IOS','appBuildVersion':'2026.10.27','artifacts':{'buildUrl':'https://expo.dev/artifacts/eas/test.ipa'}}
    def test_preview_pins_remote_increment_sha_and_staging(self):
        d=configure(self.profile(),SHA); p=d['build']['preview']
        self.assertEqual(d['cli']['appVersionSource'],'remote'); self.assertTrue(p['ios']['autoIncrement'])
        self.assertEqual(p['ios']['buildConfiguration'],'Release'); self.assertEqual(p['env']['EXPO_PUBLIC_API_URL'],API)
        self.assertEqual(p['env']['EXPO_PUBLIC_GIT_SHA'],SHA); self.assertEqual(d['build']['production'],self.profile()['build']['production'])
    def test_nonstandalone_profiles_rejected(self):
        for k,v in [('developmentClient',True),('distribution','store'),('environment','production')]:
            d=self.profile();d['build']['preview'][k]=v
            with self.assertRaises(ValueError):configure(d,SHA)
    def test_sdk54_auto_image_is_replaced_for_locked_audio_sdk_symbols(self):
        d=self.profile();d['build']['preview']['ios']['image']='auto'
        d['build']['production']['ios']={'image':'production-image'}
        result=configure(d,SHA)
        self.assertEqual(result['build']['preview']['ios']['image'],'macos-sequoia-15.6-xcode-26.2')
        self.assertEqual(result['build']['production']['ios']['image'],'production-image')
    def test_finished_matching_build_reports_identity_and_link(self):
        output=report([self.build()],SHA)
        self.assertIn(SHA,output);self.assertIn('2026.10.27',output);self.assertIn('test.ipa',output)
    def test_failed_stale_and_multiple_results_never_report_success(self):
        for k,v in [('status','ERRORED'),('status','IN_PROGRESS'),('gitCommitHash','b'*40),('platform','ANDROID'),('appBuildVersion','')]:
            b=self.build();b[k]=v
            with self.assertRaises(ValueError):report([b],SHA)
        with self.assertRaises(ValueError):report([self.build(),self.build()],SHA)
    def test_credentialed_or_signed_query_links_are_not_logged(self):
        b=self.build();b['artifacts']['buildUrl']='https://user:secret@example.com/build.ipa?token=secret'
        with self.assertRaises(ValueError):report(b,SHA)

if __name__=='__main__':unittest.main()
