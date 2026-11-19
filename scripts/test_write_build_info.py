"""Tests for write_build_info.py, using only the standard library.

Run from the repository root: python3 -m unittest discover -s scripts -p 'test_*.py'
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'write_build_info.py')
_spec = importlib.util.spec_from_file_location('write_build_info', _SCRIPT)
write_build_info = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(write_build_info)


def make_repository(directory):
    """Creates a git repository with one commit and returns that commit's hash"""
    def git(*args):
        return subprocess.run(
            ['git', '-C', directory, *args], check=True, capture_output=True, text=True
        ).stdout.strip()

    git('init', '-q')
    git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty',
        '-m', 'one')
    return git('rev-parse', 'HEAD')


class WriteBuildInfoTests(unittest.TestCase):
    def test_records_both_commits_and_the_database_checksum(self):
        with tempfile.TemporaryDirectory() as root:
            tools, lexicon = os.path.join(root, 'tools'), os.path.join(root, 'lexicon')
            os.mkdir(tools)
            os.mkdir(lexicon)
            tools_commit, lexicon_commit = make_repository(tools), make_repository(lexicon)
            db = os.path.join(root, 'english.db')
            with open(db, 'wb') as file:
                file.write(b'database bytes')
            output = os.path.join(root, 'build-info.json')

            with contextlib.redirect_stdout(io.StringIO()):
                write_build_info.main([
                    '--db', db, '--lexicon', lexicon, '--tools', tools, '--output', output,
                    '--run-url', 'https://github.com/paranext/marble-tools/actions/runs/1',
                ])

            with open(output, encoding='utf-8') as file:
                info = json.load(file)
            self.assertEqual(info['marbleTools'], {
                'repository': 'paranext/marble-tools', 'commit': tools_commit,
            })
            self.assertEqual(info['marbleLexicon']['commit'], lexicon_commit)
            self.assertTrue(info['marbleLexicon']['date'])
            self.assertEqual(info['database'], {
                'file': 'lexical.db', 'sha256': hashlib.sha256(b'database bytes').hexdigest(),
            })
            self.assertEqual(
                info['workflowRun'], 'https://github.com/paranext/marble-tools/actions/runs/1'
            )

    def test_names_the_pull_request_head_only_when_given(self):
        with_head = write_build_info.build_info('m', 'l', 'd', 's', '', 'h')
        without_head = write_build_info.build_info('m', 'l', 'd', 's', '', '')
        self.assertEqual(with_head['marbleTools']['pullRequestHead'], 'h')
        self.assertNotIn('pullRequestHead', without_head['marbleTools'])
        self.assertNotIn('workflowRun', without_head)


if __name__ == '__main__':
    unittest.main()
