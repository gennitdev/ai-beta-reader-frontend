#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { syncExampleStory } from './exampleStorySync'

const execFileAsync = promisify(execFile)
const sourceDirectory = resolve(process.argv[2] ?? '../example-story-jack')
const outputZipPath = resolve('src/demo/stories/jack-and-the-house-above-the-rain.zip')
const provenancePath = resolve('src/demo/stories/jack-and-the-house-above-the-rain.source.json')

async function git(...args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', sourceDirectory, ...args])
  return result.stdout.trim()
}

const dirty = await git('status', '--porcelain=v1', '--untracked-files=all')
if (dirty) throw new Error('Commit all example-story repository changes before syncing the frontend snapshot.')

const sourceCommit = await git('rev-parse', 'HEAD')
const remote = await git('remote', 'get-url', 'origin')
const sourceRepository = remote
  .replace(/^git@github\.com:/, 'https://github.com/')
  .replace(/\.git$/, '')

const provenance = await syncExampleStory({
  sourceDirectory,
  outputZipPath,
  provenancePath,
  sourceRepository,
  sourceCommit,
})

console.log(`Synced ${provenance.fileCount} files from ${sourceRepository}@${sourceCommit.slice(0, 12)}.`)
console.log(`Bundle SHA-256: ${provenance.bundleSha256}`)
