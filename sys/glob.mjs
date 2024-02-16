import { glob } from 'glob';
import path from 'node:path'

const list = async (srcDir) => {
  const files = await glob(path.join(srcDir, '**', '*.*'), { ignore: 'node_modules/**' })
  for (const filename of files) {
    console.log(filename)
  }
}

const copy = async (srcDir, dstDir) => {
  const resolvedSrcDir = path.resolve(srcDir)
  const resolvedDstDir = path.resolve(dstDir)
  const files = await glob(path.join(resolvedSrcDir, '**', '*.*'), { ignore: 'node_modules/**' })
  for (const filename of files) {
    const dstName = filename.replace(resolvedSrcDir, resolvedDstDir)
    console.log('copy from %s to %s', filename, dstName)
  }
}

const action = process.argv[2]
const args = process.argv.slice(3)

const funcMap = {
  list,
  copy
}

if (action in funcMap) {
  funcMap[action](...args)
} else {
  console.error('%s not implemented', action)
}
