import fs from 'node:fs/promises'


const countLines = async (filename) => {
  const fileStatus = await fs.stat(filename)
  if (fileStatus.isFile) {
    const content = await fs.readFile(filename, { encoding: 'utf-8' })
    return content.split('\n').length
  }
  console.log('%s is not a file', filename)
  return 0
}

const count = async (...filenames) => {
  const lines = await Promise.all(filenames.map(countLines))
  filenames.forEach((name, index) => {
    console.log(name, lines[index])
  })
  console.log('total', lines.reduce((prev, acc) => prev + acc, 0))
}

const funcMap = {
  count,
}


// read dir path
// argv[0] -> node path
// argv[1] -> current file path
// argv[2:] -> rest args
const action = process.argv[2]
const args = process.argv.slice(3)

if (action in funcMap) {
  funcMap[action](...args)
} else {
  console.error('function "%s" not implemented.', action)
}