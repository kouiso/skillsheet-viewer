"""CI入口だけを一時環境で動かす。アプリやDBの実データは読み込まない。"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]


class EntryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        entry = SOURCE / '.github/ci/run.sh'
        self.assertTrue(entry.is_file(), 'shared CI entry must exist')
        target = self.root / '.github/ci/run.sh'
        target.parent.mkdir(parents=True)
        shutil.copyfile(entry, target)
        (self.root / 'script').mkdir()
        (self.root / 'script/isolated-neon-preload.mjs').write_text('')
        self.preload = '--import ' + str(self.root / 'script/isolated-neon-preload.mjs')
        self.log = self.root / 'calls.jsonl'
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        mock = '''#!INTERPRETER
import json,os,pathlib,sys
args=sys.argv[1:]
name=pathlib.Path(sys.argv[0]).name
with open(os.environ['CALLS'],'a') as log:log.write(json.dumps([name,args,str(pathlib.Path.cwd()),os.environ.get('NODE_OPTIONS','')])+'\\n')
if os.environ.get('FAIL_AT') and os.environ['FAIL_AT'] in name+' '+' '.join(args):sys.exit(37)
if os.environ.get('HEADLESS_FAIL') and args==['run','test:e2e']:sys.exit(42)
'''.replace('INTERPRETER', sys.executable)
        for path in [self.bin / 'pnpm', self.root / 'script/check-naming.sh']:
            path.write_text(mock)
            path.chmod(0o755)
        self.package = self.root / 'package.json'
        self.package.write_text((SOURCE / 'package.json').read_text())
        self.env = dict(os.environ, CALLS=str(self.log), PATH=str(self.bin) + os.pathsep + os.environ['PATH'])
        for key in ['FAIL_AT', 'HEADLESS_FAIL', 'NODE_OPTIONS', 'DATABASE_URL']:
            self.env.pop(key, None)

    def run_entry(self, phase, **env):
        return subprocess.run(['bash', str(self.root / '.github/ci/run.sh'), phase], cwd=self.root,
                              env=dict(self.env, **env), text=True, capture_output=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_fast_runs_cloud_lint_type_test_build_with_naming_in_existing_lint(self):
        result = self.run_entry('fast')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([x[:2] for x in self.calls()], [['pnpm', ['run', name]] for name in ['lint', 'type-check', 'test', 'build']])
        self.assertTrue(all(x[2] == str(self.root) for x in self.calls()))

    def test_unknown_lint_script_retains_explicit_naming_before_all_checks(self):
        package = json.loads(self.package.read_text())
        package['scripts']['lint'] = 'unknown command'
        self.package.write_text(json.dumps(package))
        self.assertEqual(self.run_entry('fast').returncode, 0)
        self.assertEqual(self.calls()[0][:2], ['check-naming.sh', []])
        self.assertEqual(len(self.calls()), 5)

    def test_every_static_failure_stops_remaining_checks_and_returns_exact_status(self):
        for count, name in enumerate(['lint', 'type-check', 'test', 'build'], 1):
            self.log.unlink(missing_ok=True)
            self.assertEqual(self.run_entry('full', FAIL_AT='run ' + name).returncode, 37)
            self.assertEqual(len(self.calls()), count)

    def test_full_calls_existing_isolated_local_boundary_after_all_static_checks(self):
        self.assertEqual(self.run_entry('full').returncode, 0)
        self.assertEqual(self.calls()[-1][:2], ['pnpm', ['run', 'test:e2e:local']])
        self.assertEqual(len(self.calls()), 5)
        self.assertEqual(self.run_entry('full', FAIL_AT='test:e2e:local').returncode, 37)

    def test_prepared_e2e_runs_headless_after_playwright_failure_and_keeps_first_status(self):
        result = self.run_entry('e2e-prepared', NODE_OPTIONS=self.preload, FAIL_AT='test:e2e:playwright', HEADLESS_FAIL='1')
        self.assertEqual(result.returncode, 37)
        self.assertEqual([x[:2] for x in self.calls()], [['pnpm', ['run', 'test:e2e:playwright']], ['pnpm', ['run', 'test:e2e']]])
        self.assertTrue(all(x[3] == self.preload for x in self.calls()))

    def test_prepared_e2e_propagates_headless_failure_when_playwright_passes(self):
        self.assertEqual(self.run_entry('e2e-prepared', NODE_OPTIONS=self.preload, HEADLESS_FAIL='1').returncode, 42)
        self.assertEqual(len(self.calls()), 2)

    def test_e2e_commands_require_existing_isolated_bridge_and_unknown_modes_fail(self):
        for phase in ['playwright', 'headless', 'e2e-prepared', 'invalid']:
            self.assertEqual(self.run_entry(phase).returncode, 2)
            self.assertEqual(self.calls(), [])

    def test_bridge_guard_accepts_existing_helper_prefix_and_rejects_other_paths(self):
        good = self.run_entry('e2e-prepared', NODE_OPTIONS=self.preload + ' --conditions=react-server')
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(len(self.calls()), 2)
        self.log.unlink()
        bad = self.run_entry('playwright', NODE_OPTIONS='--import /different/isolated-neon-preload.mjs')
        self.assertEqual(bad.returncode, 2)
        self.assertEqual(self.calls(), [])

    def test_current_package_preserves_three_test_configs_and_uses_isolated_shared_entry(self):
        scripts = json.loads((SOURCE / 'package.json').read_text())['scripts']
        self.assertEqual(scripts['test'], 'vitest run && vitest run --config vitest.config.node.ts && vitest run --config vitest.config.pdf.ts')
        self.assertEqual(scripts['test:e2e:local'], './script/e2e-isolated-db.sh run bash .github/ci/run.sh e2e-prepared')
        self.assertEqual(scripts['test:e2e:playwright'], 'pnpm build && pnpm test:playwright')
        self.assertEqual(scripts['test:e2e'], 'pnpm build && node script/headless-e2e.mjs')


if __name__ == '__main__':
    unittest.main()
