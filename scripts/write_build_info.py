"""Writes build-info.json: where an English database came from and its checksum.

The Build English Database workflow puts the file in the `english-database` artifact next to
`english.db`. paranext/dependencies commits it next to the published `lexical.db.xz`, where it is the
lasting record of which marble-tools and marble-lexicon commits built the database (workflow logs,
summaries and artifacts expire), and its checks compare the published database with it.

Usage: python3 scripts/write_build_info.py --db english.db --lexicon ../marble-lexicon \
           --output build-info.json [--run-url URL] [--pull-request-head SHA]
"""
import argparse
import hashlib
import json
import subprocess
import sys


def file_sha256(path):
    """The sha256 of a file, as lowercase hexadecimal"""
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for chunk in iter(lambda: file.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit(repository_dir):
    """The full hash of the commit checked out in a git working directory"""
    return subprocess.run(
        ['git', '-C', repository_dir, 'rev-parse', 'HEAD'],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def git_commit_date(repository_dir):
    """The committer date of the commit checked out in a git working directory, in ISO 8601"""
    return subprocess.run(
        ['git', '-C', repository_dir, 'log', '-1', '--format=%cI'],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def build_info(tools_commit, lexicon_commit, lexicon_date, db_sha256, run_url, pull_request_head):
    """The build-info.json content. `tools_commit` is what was checked out, which for a pull
    request run is GitHub's merge commit; `pull_request_head` then names the branch's commit."""
    info = {
        'marbleTools': {'repository': 'paranext/marble-tools', 'commit': tools_commit},
        'marbleLexicon': {
            'repository': 'ubsicap/marble-lexicon',
            'commit': lexicon_commit,
            'date': lexicon_date,
        },
        'database': {'file': 'lexical.db', 'sha256': db_sha256},
    }
    if pull_request_head:
        info['marbleTools']['pullRequestHead'] = pull_request_head
    if run_url:
        info['workflowRun'] = run_url
    return info


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--db', required=True, help='the English database (english.db)')
    parser.add_argument('--lexicon', required=True, help='the marble-lexicon checkout')
    parser.add_argument('--output', required=True, help='where to write build-info.json')
    parser.add_argument('--tools', default='.', help='the marble-tools checkout (default: .)')
    parser.add_argument('--run-url', default='', help='the workflow run that built the database')
    parser.add_argument('--pull-request-head', default='', help="a pull request branch's commit")
    args = parser.parse_args(argv)

    info = build_info(
        git_commit(args.tools),
        git_commit(args.lexicon),
        git_commit_date(args.lexicon),
        file_sha256(args.db),
        args.run_url,
        args.pull_request_head,
    )
    with open(args.output, 'w', encoding='utf-8') as file:
        json.dump(info, file, indent=2)
        file.write('\n')
    print(json.dumps(info, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
