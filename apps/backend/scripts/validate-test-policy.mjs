import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const backendRoot = new URL('..', import.meta.url).pathname
const sourceRoot = join(backendRoot, 'src')

const allowedSuffixes = ['.spec.ts', '.it.spec.ts', '.live.it.spec.ts', '.e2e.spec.ts']

const collectTsFiles = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dirPath, entry.name)

      if (entry.isDirectory()) {
        return collectTsFiles(fullPath)
      }

      if (entry.isFile() && entry.name.endsWith('.ts')) {
        return [fullPath]
      }

      return []
    })
  )

  return paths.flat()
}

const hasAllowedSuffix = (filePath) => {
  return allowedSuffixes.some((suffix) => filePath.endsWith(suffix))
}

const readAllFiles = async (files) => {
  return Promise.all(files.map(async (filePath) => ({ filePath, content: await readFile(filePath, 'utf8') })))
}

const run = async () => {
  const files = await collectTsFiles(sourceRoot)
  const testFiles = files.filter((filePath) => filePath.includes('.spec.ts'))

  const namingViolations = testFiles.filter((filePath) => !hasAllowedSuffix(filePath))

  if (namingViolations.length > 0) {
    throw new Error(
      `Invalid test filename pattern:\n${namingViolations
        .map((filePath) => `- ${filePath}`)
        .join('\n')}\nAllowed: ${allowedSuffixes.join(', ')}`
    )
  }

  const testContents = await readAllFiles(testFiles)
  const onlyViolations = testContents.filter(({ content }) => /\b(describe|it|test)\.only\(/.test(content))

  if (onlyViolations.length > 0) {
    throw new Error(
      `.only is forbidden in committed tests:\n${onlyViolations
        .map(({ filePath }) => `- ${filePath}`)
        .join('\n')}`
    )
  }

  const skipViolations = testContents.filter(({ content }) => /\b(describe|it|test)\.skip\(/.test(content))

  if (skipViolations.length > 0) {
    throw new Error(
      `.skip requires issue-linked quarantine policy; remove before merge:\n${skipViolations
        .map(({ filePath }) => `- ${filePath}`)
        .join('\n')}`
    )
  }

  process.stdout.write('Test policy validation passed.\n')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
