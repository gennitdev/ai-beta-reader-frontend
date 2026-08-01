# Releases

Releases use squash-merged pull requests as the source of truth. Every pull request title must follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/), because GitHub uses that title for the squash commit on `main`. For a pull request containing only one commit, CI validates that commit too, since GitHub may offer its title as the squash title.

## Pull request titles

Use one of the allowed types followed by a short description:

```text
feat: add revision activity heatmap
fix(bardwall): keep the map inside its container
docs: explain local backups
feat!: replace the backup file format
```

The title determines release impact:

| Title | Version effect | Example |
| --- | --- | --- |
| `fix:` | Patch | `1.4.2` → `1.4.3` |
| `feat:` | Minor | `1.4.2` → `1.5.0` |
| `type!:` | Major | `1.4.2` → `2.0.0` |
| `build:`, `chore:`, `ci:`, `docs:`, `perf:`, `refactor:`, `revert:`, `style:`, `test:` | Included as appropriate, but does not normally cause a release by itself | — |

Scopes such as `feat(bardwall): ...` are optional. For a breaking change in a one-line pull request title, put `!` before the colon.

## Publishing a release

The `Release` workflow runs after changes land on `main`. Release Please reads conventional squash commits since the previous release and maintains one release pull request containing:

- the next semantic version;
- matching updates to `package.json` and `package-lock.json`;
- generated `CHANGELOG.md` entries.

Review and merge that release pull request when the accumulated changes are ready to publish. Its merge causes the workflow to create the `vX.Y.Z` tag and corresponding GitHub Release. This repository is a private npm package, so the workflow does not publish anything to npm. Vercel deployment remains independent and continues to follow `main`.

The workflow can also be run manually from **Actions → Release → Run workflow**. A manual run recalculates or refreshes the release pull request; it does not bypass the conventional-commit version calculation.

## One-time GitHub settings

Configure these settings after the workflows are present on the default branch:

1. Under **Settings → General → Pull Requests**, keep squash merging enabled and set its default commit title to **Pull request title**.
2. In a branch protection rule or ruleset for `main`, require pull requests and require the `Validate PR title` status check.
3. Prefer allowing only squash merges if every commit on `main` should participate predictably in release calculation.
4. Add a fine-grained token or GitHub App token as the `RELEASE_PLEASE_TOKEN` Actions secret if release pull requests must trigger CI. It needs contents and pull-request write access. Without it, the workflow falls back to `GITHUB_TOKEN`, which can create releases and release pull requests but does not trigger new workflow runs for its own pull requests.
