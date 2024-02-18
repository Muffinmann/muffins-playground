export default (iterable) => new Promise((res, rej) => {
  let index = 0
  let final = []
  if (iterable.length === 0) {
    res([])
  }
  for (const promise of iterable) {
    promise.then((result) => {
      final[index] = result
      index += 1
      if (index === iterable.length) {
        res(final)
      }
    })
  }
})